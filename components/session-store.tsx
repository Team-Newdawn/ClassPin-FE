"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth-context";
import type { ClassSession, PresentationQrPosition, Question, Slide } from "@/lib/types";
import { getAudienceSupabaseClient, getSupabaseClient, supabaseConfigured } from "@/lib/supabase/client";
import { appendSessionSlides, deleteSessionSlide, fetchLectureSnapshot, fetchLectureStatus, fetchLiveSession, fetchOwnedSessions, fetchSessionSlides, markQuestionResolved, persistSession, postAnswer, saveSlideInstructorNote, submitQuestion, subscribeToLecture, updateLecture, updateQuestion as persistQuestionUpdate } from "@/lib/supabase/repository";

const STORAGE_KEY = "pin-class-sessions-v1";
const SUPABASE_CACHE_PREFIX = "pin-class-sessions-cache-v2";
// 예전 빌드가 시드로 심어 둔 데모 세션. 저장본에 남아 있으면 첫 로드에서 걷어낸다.
const DEMO_SESSION_ID = "demo-session";

type Store = {
  ready: boolean;
  sessions: ClassSession[];
  createSession: (input: { title: string; fileName: string; slides: Slide[] }) => Promise<ClassSession>;
  appendSlides: (sessionId: string, files: File[]) => Promise<void>;
  deleteSlide: (sessionId: string, slideId: string) => Promise<void>;
  addQuestion: (sessionId: string, question: Omit<Question, "id" | "sessionId" | "createdAt" | "status">) => Promise<void>;
  updateQuestion: (sessionId: string, questionId: string, values: Pick<Question, "category" | "text">) => Promise<void>;
  answerQuestion: (sessionId: string, questionId: string, answer: string) => Promise<void>;
  resolveQuestion: (sessionId: string, questionId: string) => Promise<void>;
  setCurrentSlide: (sessionId: string, slide: number) => Promise<void>;
  setStatus: (sessionId: string, status: ClassSession["status"]) => Promise<void>;
  setShowQuestionPins: (sessionId: string, visible: boolean) => Promise<void>;
  setShowPresentationQr: (sessionId: string, visible: boolean) => Promise<void>;
  setPresentationQrPosition: (sessionId: string, position: PresentationQrPosition) => Promise<void>;
  updateSlideNote: (sessionId: string, slideId: string, body: string) => Promise<void>;
  loadSessionByCode: (code: string) => Promise<ClassSession | null>;
};

const SessionContext = createContext<Store | null>(null);

const makeCode = () => `PIN${Math.floor(100 + Math.random() * 900)}`;
const cacheKey = (userId: string) => `${SUPABASE_CACHE_PREFIX}:${userId}`;
const APPENDABLE_SLIDE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SLIDE_IMAGE_BYTES = 10 * 1024 * 1024;
const PARTICIPANT_STATUS_POLL_MS = 2_000;

const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error ?? new Error("이미지를 읽지 못했습니다."));
  reader.readAsDataURL(file);
});

const errorDetail = (error: unknown) => {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return error instanceof Error ? error.message : String(error);
};

const readCachedSessions = (userId: string) => {
  try {
    const cached = window.localStorage.getItem(cacheKey(userId));
    return cached ? dedupeById(JSON.parse(cached) as ClassSession[]) : [];
  } catch {
    return [];
  }
};

// 같은 id 가 두 번 들어오면 목록마다 React key 가 충돌한다. 한 번 섞이면 localStorage 로 계속
// 살아남으므로, 밖에서 들어오는 배열은 모두 이 문을 지나게 해서 저장본까지 스스로 낫게 한다.
// 중복이 없으면 원본 배열을 그대로 돌려줘 헛도는 리렌더를 만들지 않는다.
const dedupeById = (list: ClassSession[]) => {
  const seen = new Set<string>();
  const normalized = list.map((session) => {
    const showQuestionPins = session.showQuestionPins ?? true;
    const showPresentationQr = session.showPresentationQr ?? true;
    const presentationQrPosition = session.presentationQrPosition ?? "bottom-right";
    return showQuestionPins === session.showQuestionPins && showPresentationQr === session.showPresentationQr && presentationQrPosition === session.presentationQrPosition
      ? session
      : { ...session, showQuestionPins, showPresentationQr, presentationQrPosition };
  });
  const unique = normalized.filter((session) => {
    if (seen.has(session.id)) return false;
    seen.add(session.id);
    return true;
  });
  return unique.length === list.length && normalized.every((session, index) => session === list[index]) ? list : unique;
};

export function SessionStore({ children }: { children: React.ReactNode }) {
  const { loading: authLoading, user, isAdmin } = useAuth();
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [ready, setReady] = useState(false);
  const lookups = useRef(new Map<string, Promise<ClassSession | null>>());
  const slideWrites = useRef(new Map<string, Promise<void>>());
  const slideTargets = useRef(new Map<string, number>());
  const refreshSequences = useRef(new Map<string, number>());
  const slideRefreshSequences = useRef(new Map<string, number>());
  const ownerId = useRef<string | null>(null);
  const sessionsRef = useRef<ClassSession[]>([]);
  const authUserId = user?.id ?? null;
  const authIsAnonymous = user?.is_anonymous ?? false;

  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  // demo 모드에서만 localStorage가 기준 데이터다.
  useEffect(() => {
    if (supabaseConfigured) return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    queueMicrotask(() => {
      const restored: ClassSession[] = stored ? JSON.parse(stored) : [];
      setSessions(dedupeById(restored).filter((session) => session.id !== DEMO_SESSION_ID));
      setReady(true);
    });
  }, []);

  // Supabase 모드에서는 현재 강사가 소유한 DB 데이터가 유일한 기준이다.
  // 계정별 localStorage는 DB 조회가 실패했을 때만 쓰는 임시 캐시다.
  useEffect(() => {
    if (!supabaseConfigured) return;
    let active = true;
    if (authLoading) {
      queueMicrotask(() => { if (active) setReady(false); });
      return () => { active = false; };
    }
    if (authUserId && !authIsAnonymous && isAdmin) {
      ownerId.current = authUserId;
      queueMicrotask(() => { if (active) setReady(false); });
      const cached = readCachedSessions(authUserId);
      void fetchOwnedSessions()
        .then((remote) => {
          if (!active) return;
          setSessions(dedupeById(remote));
          setReady(true);
        })
        .catch((error) => {
          if (!active) return;
          console.error(`Supabase session load failed: ${errorDetail(error)}`, error);
          setSessions(cached);
          setReady(true);
        });
      return () => { active = false; };
    }

    // 로그아웃하거나 익명 수강생으로 바뀌면 이전 강사의 메모리 상태를 노출하지 않는다.
    const hadOwner = Boolean(ownerId.current);
    ownerId.current = null;
    queueMicrotask(() => {
      if (!active) return;
      if (hadOwner) setSessions([]);
      setReady(true);
    });
    return () => { active = false; };
  }, [authIsAnonymous, authLoading, authUserId, isAdmin]);

  const subscriptionKey = [...new Set(sessions.filter((session) => session.courseId).map((session) => session.id))].sort().join("|");
  useEffect(() => {
    if (!ready || !supabaseConfigured || !subscriptionKey) return;
    const tracked = [...new Map(
      sessions.filter((session) => session.courseId).map((session) => [session.id, session])
    ).values()];
    const asAudience = !ownerId.current;
    let active = true;
    let statusPoll: ReturnType<typeof setInterval> | null = null;
    const channels: NonNullable<ReturnType<typeof subscribeToLecture>>[] = [];
    const refresh = async (session: ClassSession) => {
      const refreshSequence = (refreshSequences.current.get(session.id) ?? 0) + 1;
      refreshSequences.current.set(session.id, refreshSequence);
      try {
        const latestSession = sessionsRef.current.find((item) => item.id === session.id) ?? session;
        const snapshot = await fetchLectureSnapshot(latestSession, asAudience);
        if (!active || !snapshot || refreshSequences.current.get(session.id) !== refreshSequence) return;
        setSessions((current) => current.map((item) => {
          if (item.id !== session.id) return item;
          const localTarget = slideTargets.current.get(session.id);
          return {
            ...item,
            ...snapshot,
            // 발표자가 빠르게 넘기는 동안에는 DB의 중간 페이지가 낙관적 화면을
            // 되돌리지 못하게 한다. 청중은 계속 서버 페이지를 그대로 따른다.
            currentSlide: !asAudience && localTarget !== undefined
              ? item.currentSlide
              : snapshot.currentSlide
          };
        }));
      } catch (error) { console.error("Supabase realtime refresh failed", error); }
    };
    const refreshSlides = async (session: ClassSession) => {
      const refreshSequence = (slideRefreshSequences.current.get(session.id) ?? 0) + 1;
      slideRefreshSequences.current.set(session.id, refreshSequence);
      try {
        const latestSession = sessionsRef.current.find((item) => item.id === session.id) ?? session;
        const slides = await fetchSessionSlides(latestSession, asAudience);
        if (!active || slideRefreshSequences.current.get(session.id) !== refreshSequence) return;
        setSessions((current) => current.map((item) => item.id === session.id ? { ...item, slides } : item));
      } catch (error) { console.error("Supabase slide refresh failed", error); }
    };
    const connect = async () => {
      try {
        tracked.forEach((session) => {
          const channel = subscribeToLecture(
            session.id,
            session.materialVersionId,
            () => void refresh(session),
            () => void refreshSlides(session),
            asAudience
          );
          if (channel) channels.push(channel);
        });
        await Promise.all(tracked.flatMap((session) => [refresh(session), refreshSlides(session)]));
      } catch (error) { console.error("Supabase authentication failed", error); }
    };
    void connect();
    if (asAudience) {
      statusPoll = setInterval(() => {
        tracked.forEach((session) => {
          const latestSession = sessionsRef.current.find((item) => item.id === session.id) ?? session;
          void fetchLectureStatus(latestSession, true)
            .then((status) => {
              if (!active) return;
              setSessions((current) => current.map((item) => item.id === session.id && item.status !== status ? { ...item, status } : item));
            })
            .catch((error) => console.error("Supabase lecture status refresh failed", error));
        });
      }, PARTICIPANT_STATUS_POLL_MS);
    }
    return () => {
      active = false;
      if (statusPoll) clearInterval(statusPoll);
      const client = asAudience ? getAudienceSupabaseClient() : getSupabaseClient();
      if (client) channels.forEach((channel) => void client.removeChannel(channel));
    };
    // Session question changes do not recreate subscriptions; only the stable id set does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, subscriptionKey]);

  useEffect(() => {
    if (!ready) return;
    if (supabaseConfigured) {
      if (ownerId.current) window.localStorage.setItem(cacheKey(ownerId.current), JSON.stringify(sessions));
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    const channel = new BroadcastChannel("pin-class-live");
    channel.postMessage(sessions);
    channel.close();
  }, [sessions, ready]);

  useEffect(() => {
    if (supabaseConfigured) return;
    const channel = new BroadcastChannel("pin-class-live");
    channel.onmessage = (event) => setSessions((current) => {
      const next = dedupeById(event.data as ClassSession[]);
      return JSON.stringify(current) === JSON.stringify(next) ? current : next;
    });
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue) setSessions(dedupeById(JSON.parse(event.newValue)));
    };
    window.addEventListener("storage", onStorage);
    return () => { channel.close(); window.removeEventListener("storage", onStorage); };
  }, []);

  const createSession = useCallback(async (input: { title: string; fileName: string; slides: Slide[] }) => {
    const materialVersionId = crypto.randomUUID();
    const session: ClassSession = {
      id: crypto.randomUUID(), courseId: crypto.randomUUID(), materialId: crypto.randomUUID(), materialVersionId,
      code: makeCode(), title: input.title, fileName: input.fileName,
      status: "live", currentSlide: 0, showQuestionPins: true, showPresentationQr: true, presentationQrPosition: "bottom-right",
      createdAt: new Date().toISOString(), slides: input.slides, questions: []
    };
    if (supabaseConfigured) await persistSession(session);
    setSessions((current) => [session, ...current]);
    return session;
  }, []);

  const updateSession = useCallback((id: string, fn: (session: ClassSession) => ClassSession) => {
    setSessions((current) => current.map((session) => session.id === id ? fn(session) : session));
  }, []);

  const value = useMemo<Store>(() => ({
    ready,
    sessions,
    createSession,
    appendSlides: async (sessionId, files) => {
      const session = sessions.find((item) => item.id === sessionId);
      if (!session) throw new Error("슬라이드를 추가할 강의를 찾지 못했습니다.");
      if (files.length < 1 || files.length > 20) throw new Error("슬라이드는 한 번에 1~20장까지 추가할 수 있습니다.");
      if (files.some((file) => !APPENDABLE_SLIDE_TYPES.has(file.type) || file.size > MAX_SLIDE_IMAGE_BYTES)) {
        throw new Error("10MB 이하의 PNG, JPG, WebP 이미지만 추가할 수 있습니다.");
      }
      const appended = supabaseConfigured
        ? await appendSessionSlides(session, files)
        : await Promise.all(files.map(async (file, index): Promise<Slide> => ({
          id: crypto.randomUUID(),
          pageIndex: session.slides.length + index,
          title: `Slide ${session.slides.length + index + 1}`,
          imageUrl: await fileToDataUrl(file),
          speakerNote: ""
        })));
      updateSession(sessionId, (current) => {
        const byId = new Map(current.slides.map((slide) => [slide.id, slide]));
        appended.forEach((slide) => byId.set(slide.id, slide));
        return { ...current, slides: [...byId.values()].sort((a, b) => a.pageIndex - b.pageIndex) };
      });
    },
    deleteSlide: async (sessionId, slideId) => {
      const session = sessions.find((item) => item.id === sessionId);
      if (!session) throw new Error("슬라이드를 삭제할 강의를 찾지 못했습니다.");
      const deletedIndex = session.slides.findIndex((slide) => slide.id === slideId);
      if (deletedIndex < 0) throw new Error("삭제할 슬라이드를 찾지 못했습니다.");
      if (session.slides.length <= 1) throw new Error("마지막 슬라이드는 삭제할 수 없습니다.");

      if (supabaseConfigured) {
        await deleteSessionSlide(slideId);
        const slides = await fetchSessionSlides(session);
        const snapshot = await fetchLectureSnapshot({ ...session, slides });
        updateSession(sessionId, (current) => ({ ...current, slides, ...(snapshot ?? {}) }));
        return;
      }

      updateSession(sessionId, (current) => {
        const slides = current.slides
          .filter((slide) => slide.id !== slideId)
          .map((slide, pageIndex) => ({ ...slide, pageIndex, title: `Slide ${pageIndex + 1}` }));
        const questions = current.questions
          .filter((question) => question.slideIndex !== deletedIndex)
          .map((question) => question.slideIndex > deletedIndex ? { ...question, slideIndex: question.slideIndex - 1 } : question);
        const currentSlide = current.currentSlide > deletedIndex
          ? current.currentSlide - 1
          : current.currentSlide === deletedIndex
            ? Math.min(deletedIndex, slides.length - 1)
            : current.currentSlide;
        return { ...current, slides, questions, currentSlide };
      });
    },
    addQuestion: async (sessionId, input) => {
      const session = sessions.find((item) => item.id === sessionId);
      if (!session) throw new Error("질문을 남길 강의를 찾지 못했습니다.");
      const question: Question = { ...input, id: crypto.randomUUID(), sessionId, status: "unanswered", createdAt: new Date().toISOString() };
      if (supabaseConfigured) await submitQuestion(session, question);
      updateSession(sessionId, (current) => ({
        ...current,
        questions: current.questions.some((item) => item.id === question.id)
          ? current.questions.map((item) => item.id === question.id ? question : item)
          : [question, ...current.questions]
      }));
    },
    updateQuestion: async (sessionId, questionId, values) => {
      if (supabaseConfigured) await persistQuestionUpdate(questionId, values);
      updateSession(sessionId, (session) => ({
        ...session,
        questions: session.questions.map((question) => question.id === questionId ? { ...question, ...values } : question)
      }));
    },
    answerQuestion: async (sessionId, questionId, answer) => {
      if (supabaseConfigured) await postAnswer(questionId, answer);
      updateSession(sessionId, (session) => ({ ...session, questions: session.questions.map((q) => q.id === questionId ? { ...q, answer, status: "answered" } : q) }));
    },
    resolveQuestion: async (sessionId, questionId) => {
      if (supabaseConfigured) await markQuestionResolved(questionId);
      updateSession(sessionId, (session) => ({ ...session, questions: session.questions.map((q) => q.id === questionId ? { ...q, status: "resolved" } : q) }));
    },
    setCurrentSlide: async (sessionId, currentSlide) => {
      const session = sessions.find((item) => item.id === sessionId);
      if (!session) throw new Error("슬라이드를 변경할 강의를 찾지 못했습니다.");
      const nextSlide = Math.min(Math.max(0, currentSlide), Math.max(0, session.slides.length - 1));

      // 화면은 즉시 마지막 입력을 반영하고, DB에는 현재 처리 중인 값과 마지막 목표만
      // 저장한다. 빠른 입력 사이의 모든 중간 페이지를 순서대로 쓰지 않는다.
      slideTargets.current.set(sessionId, nextSlide);
      updateSession(sessionId, (current) => ({ ...current, currentSlide: nextSlide }));
      if (!supabaseConfigured) {
        slideTargets.current.delete(sessionId);
        return;
      }

      let write = slideWrites.current.get(sessionId);
      if (!write) {
        write = (async () => {
          try {
            while (true) {
              const target = slideTargets.current.get(sessionId);
              if (target === undefined) return;
              await updateLecture(sessionId, { current_page: target });
              if (slideTargets.current.get(sessionId) === target) return;
            }
          } finally {
            // 이미 시작된 Realtime 조회가 마지막 DB 응답 뒤에 도착해도 폐기한다.
            refreshSequences.current.set(sessionId, (refreshSequences.current.get(sessionId) ?? 0) + 1);
            slideTargets.current.delete(sessionId);
          }
        })();
        slideWrites.current.set(sessionId, write);
        const clearWrite = () => {
          if (slideWrites.current.get(sessionId) === write) slideWrites.current.delete(sessionId);
        };
        void write.then(clearWrite, clearWrite);
      }
      await write;
    },
    setStatus: async (sessionId, status) => {
      if (supabaseConfigured) await updateLecture(sessionId, { status });
      updateSession(sessionId, (session) => ({ ...session, status }));
    },
    setShowQuestionPins: async (sessionId, visible) => {
      if (supabaseConfigured) await updateLecture(sessionId, { show_question_pins: visible });
      updateSession(sessionId, (session) => ({ ...session, showQuestionPins: visible }));
    },
    setShowPresentationQr: async (sessionId, visible) => {
      if (supabaseConfigured) await updateLecture(sessionId, { show_presentation_qr: visible });
      updateSession(sessionId, (session) => ({ ...session, showPresentationQr: visible }));
    },
    setPresentationQrPosition: async (sessionId, position) => {
      if (supabaseConfigured) await updateLecture(sessionId, { presentation_qr_position: position });
      updateSession(sessionId, (session) => ({ ...session, presentationQrPosition: position }));
    },
    updateSlideNote: async (sessionId, slideId, body) => {
      if (supabaseConfigured) await saveSlideInstructorNote(slideId, body);
      updateSession(sessionId, (session) => ({
        ...session,
        slides: session.slides.map((slide) => slide.id === slideId ? { ...slide, speakerNote: body } : slide)
      }));
    },
    loadSessionByCode: async (code) => {
      const key = code.toLowerCase();
      const existing = sessions.find((session) => session.code.toLowerCase() === key);
      if (existing) return existing;
      // sessions 는 이 클로저가 만들어진 시점의 값이다. 같은 코드로 조회가 겹치면 (StrictMode 의
      // 이펙트 재실행, 재진입) 위 검사를 둘 다 통과해 같은 세션이 두 번 앞에 붙는다.
      // 조회를 하나로 묶고, 넣는 순간 최신 목록에서 id 를 다시 확인한다.
      const inflight = lookups.current.get(key);
      if (inflight) return inflight;
      const lookup = fetchLiveSession(code)
        .then((remote) => {
          if (remote) setSessions((current) => current.some((session) => session.id === remote.id) ? current : [remote, ...current]);
          return remote;
        })
        .finally(() => lookups.current.delete(key));
      lookups.current.set(key, lookup);
      return lookup;
    }
  }), [createSession, ready, sessions, updateSession]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessions() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSessions must be used inside SessionStore");
  return value;
}
