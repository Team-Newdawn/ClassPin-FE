"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/app/_controller/auth-context";
import { classFolderColorIndexForOrder, defaultQuestionCategorySettings, isParticipantPointAnchor, normalizeClassFolderColorIndex, normalizeClassFolderName, normalizeQuestionCategorySettings, type ClassFolder, type ClassSession, type ParticipantQuestionInput, type PresentationQrPosition, type Question, type QuestionCategorySettings, type Slide } from "@/app/_model/types";
import { withQuestionReaction } from "@/app/_model/question-reactions";
import { normalizeSessions } from "@/app/_model/class/session";
import { appendSessionSlides, classSessionPersistenceEnabled, createClassFolder as persistClassFolder, deleteClassFolder as persistClassFolderDeletion, deleteClassSession as persistSessionDeletion, deleteSessionSlide, fetchLectureSnapshot, fetchLiveSession, fetchLiveSessionById, fetchOwnedClassFolders, fetchOwnedSessions, fetchSessionSlides, markQuestionResolved, moveSessionToFolder as persistSessionFolder, persistSession, postAnswer, renameClassFolder as persistClassFolderName, saveSlideInstructorNote, setQuestionReaction as persistQuestionReaction, submitQuestion, subscribeToLecture, updateLecture, updateQuestion as persistQuestionUpdate, validateSlideImages, type LectureRealtimeRow } from "@/app/_service/class-session-service";

const STORAGE_KEY = "pin-class-sessions-v1";
const FOLDER_STORAGE_KEY = "pin-class-folders-v1";
const SUPABASE_CACHE_PREFIX = "pin-class-sessions-cache-v2";
const SUPABASE_FOLDER_CACHE_PREFIX = "pin-class-folders-cache-v1";
// 예전 빌드가 시드로 심어 둔 데모 세션. 저장본에 남아 있으면 첫 로드에서 걷어낸다.
const DEMO_SESSION_ID = "demo-session";

type Store = {
  ready: boolean;
  sessions: ClassSession[];
  folders: ClassFolder[];
  createFolder: (name: string) => Promise<ClassFolder>;
  renameFolder: (folderId: string, name: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  moveSessionToFolder: (sessionId: string, folderId: string | null) => Promise<void>;
  createSession: (input: { folderId: string | null; title: string; fileName: string; slides: Slide[]; sourcePath?: string }) => Promise<ClassSession>;
  deleteSession: (sessionId: string) => Promise<void>;
  appendSlides: (sessionId: string, files: File[]) => Promise<void>;
  deleteSlide: (sessionId: string, slideId: string) => Promise<void>;
  addQuestion: (sessionId: string, question: ParticipantQuestionInput) => Promise<void>;
  updateQuestion: (sessionId: string, questionId: string, values: Pick<Question, "category" | "marker" | "text">) => Promise<void>;
  reactToQuestion: (sessionId: string, questionId: string, reacted: boolean) => Promise<void>;
  answerQuestion: (sessionId: string, questionId: string, answer: string) => Promise<void>;
  resolveQuestion: (sessionId: string, questionId: string) => Promise<void>;
  setCurrentSlide: (sessionId: string, slide: number) => Promise<void>;
  setStatus: (sessionId: string, status: ClassSession["status"]) => Promise<void>;
  setShowQuestionPins: (sessionId: string, visible: boolean) => Promise<void>;
  setPresentationQrPlacement: (sessionId: string, position: PresentationQrPosition | null) => Promise<void>;
  setQuestionCategories: (sessionId: string, settings: QuestionCategorySettings) => Promise<void>;
  updateSlideNote: (sessionId: string, slideId: string, body: string) => Promise<void>;
  loadSessionByCode: (code: string) => Promise<ClassSession | null>;
  loadSessionById: (sessionId: string) => Promise<ClassSession | null>;
  setActiveSession: (sessionId: string | null) => void;
};

const SessionContext = createContext<Store | null>(null);

const makeCode = () => `PIN${crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`;
const cacheKey = (userId: string) => `${SUPABASE_CACHE_PREFIX}:${userId}`;
const folderCacheKey = (userId: string) => `${SUPABASE_FOLDER_CACHE_PREFIX}:${userId}`;
const PARTICIPANT_STATUS_POLL_MS = 2_000;
type LectureSettingPatch = Partial<Pick<ClassSession,
  "status" | "showQuestionPins" | "showPresentationQr" | "presentationQrPosition"
>>;

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
    return cached ? normalizeSessions(JSON.parse(cached) as ClassSession[]) : [];
  } catch {
    return [];
  }
};

const readFolders = (key: string) => {
  try {
    const stored = window.localStorage.getItem(key);
    const folders = stored ? JSON.parse(stored) : [];
    return Array.isArray(folders) ? (folders as ClassFolder[]).map((folder, index) => ({
      ...folder,
      colorIndex: normalizeClassFolderColorIndex(folder.colorIndex, index)
    })) : [];
  } catch {
    return [];
  }
};

export function SessionStore({ children }: { children: React.ReactNode }) {
  const { loading: authLoading, user, isAdmin } = useAuth();
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [folders, setFolders] = useState<ClassFolder[]>([]);
  const [ready, setReady] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const lookups = useRef(new Map<string, Promise<ClassSession | null>>());
  const slideWrites = useRef(new Map<string, Promise<void>>());
  const slideTargets = useRef(new Map<string, number>());
  const lectureSettingTargets = useRef(new Map<string, LectureSettingPatch>());
  const refreshSequences = useRef(new Map<string, number>());
  const slideRefreshSequences = useRef(new Map<string, number>());
  const ownerId = useRef<string | null>(null);
  const demoChannelRef = useRef<BroadcastChannel | null>(null);
  const sessionsByIdRef = useRef<ReadonlyMap<string, ClassSession>>(new Map());
  const authUserId = user?.id ?? null;
  const authIsAnonymous = user?.is_anonymous ?? false;
  const sessionsById = useMemo(() => new Map(sessions.map((session) => [session.id, session])), [sessions]);
  const sessionsByCode = useMemo(() => new Map(sessions.map((session) => [session.code.toLowerCase(), session])), [sessions]);
  const foldersById = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);

  useEffect(() => { sessionsByIdRef.current = sessionsById; }, [sessionsById]);

  // demo 모드에서만 localStorage가 기준 데이터다.
  useEffect(() => {
    if (classSessionPersistenceEnabled) return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    queueMicrotask(() => {
      const restored: ClassSession[] = stored ? JSON.parse(stored) : [];
      setSessions(normalizeSessions(restored).filter((session) => session.id !== DEMO_SESSION_ID));
      setFolders(readFolders(FOLDER_STORAGE_KEY));
      setReady(true);
    });
  }, []);

  // Supabase 모드에서는 현재 강사가 소유한 DB 데이터가 유일한 기준이다.
  // 계정별 localStorage는 DB 조회가 실패했을 때만 쓰는 임시 캐시다.
  useEffect(() => {
    if (!classSessionPersistenceEnabled) return;
    let active = true;
    if (authLoading) {
      queueMicrotask(() => { if (active) setReady(false); });
      return () => { active = false; };
    }
    if (authUserId && !authIsAnonymous && isAdmin) {
      ownerId.current = authUserId;
      queueMicrotask(() => { if (active) setReady(false); });
      const cached = readCachedSessions(authUserId);
      const cachedFolders = readFolders(folderCacheKey(authUserId));
      void Promise.all([fetchOwnedSessions(), fetchOwnedClassFolders()])
        .then(([remote, remoteFolders]) => {
          if (!active) return;
          setSessions(normalizeSessions(remote));
          setFolders(remoteFolders);
          setReady(true);
        })
        .catch((error) => {
          if (!active) return;
          console.error(`Supabase session load failed: ${errorDetail(error)}`, error);
          setSessions(cached);
          setFolders(cachedFolders);
          setReady(true);
        });
      return () => { active = false; };
    }

    // 로그아웃하거나 익명 수강생으로 바뀌면 이전 강사의 메모리 상태를 노출하지 않는다.
    const hadOwner = Boolean(ownerId.current);
    ownerId.current = null;
    queueMicrotask(() => {
      if (!active) return;
      if (hadOwner) {
        setSessions([]);
        setFolders([]);
      }
      setReady(true);
    });
    return () => { active = false; };
  }, [authIsAnonymous, authLoading, authUserId, isAdmin]);

  const subscriptionKey = activeSessionId && sessionsById.get(activeSessionId)?.courseId ? activeSessionId : "";
  useEffect(() => {
    if (!ready || !classSessionPersistenceEnabled || !subscriptionKey) return;
    const tracked = sessionsById.get(subscriptionKey);
    if (!tracked) return;
    const asAudience = !ownerId.current;
    let active = true;
    let statusPoll: ReturnType<typeof setInterval> | null = null;
    const unsubscribe: Array<() => void> = [];
    const refresh = async (session: ClassSession) => {
      const refreshSequence = (refreshSequences.current.get(session.id) ?? 0) + 1;
      refreshSequences.current.set(session.id, refreshSequence);
      try {
        const latestSession = sessionsByIdRef.current.get(session.id) ?? session;
        const snapshot = await fetchLectureSnapshot(latestSession, asAudience);
        if (!active || !snapshot || refreshSequences.current.get(session.id) !== refreshSequence) return;
        setSessions((current) => current.map((item) => {
          if (item.id !== session.id) return item;
          const localTarget = slideTargets.current.get(session.id);
          const localSettings = lectureSettingTargets.current.get(session.id);
          return {
            ...item,
            ...snapshot,
            ...localSettings,
            // 발표자가 빠르게 넘기는 동안에는 DB의 중간 페이지가 낙관적 화면을
            // 되돌리지 못하게 한다. 청중은 계속 서버 페이지를 그대로 따른다.
            currentSlide: !asAudience && localTarget !== undefined
              ? item.currentSlide
              : snapshot.currentSlide
          };
        }));
      } catch (error) { console.error("Supabase realtime refresh failed", error); }
    };
    const applyLectureUpdate = (session: ClassSession, lecture: LectureRealtimeRow) => {
      if (!active) return;
      setSessions((current) => current.map((item) => item.id === session.id ? {
        ...item,
        currentSlide: !asAudience && slideTargets.current.has(session.id) ? item.currentSlide : lecture.current_page,
        status: lecture.status,
        presentationInteractions: lecture.presentation_interactions,
        showQuestionPins: lecture.show_question_pins,
        showPresentationQr: lecture.show_presentation_qr,
        presentationQrPosition: lecture.presentation_qr_position,
        questionCategories: normalizeQuestionCategorySettings(lecture.question_categories),
        ...lectureSettingTargets.current.get(session.id)
      } : item));
    };
    const refreshSlides = async (session: ClassSession) => {
      const refreshSequence = (slideRefreshSequences.current.get(session.id) ?? 0) + 1;
      slideRefreshSequences.current.set(session.id, refreshSequence);
      try {
        const latestSession = sessionsByIdRef.current.get(session.id) ?? session;
        const slides = await fetchSessionSlides(latestSession, asAudience);
        if (!active || slideRefreshSequences.current.get(session.id) !== refreshSequence) return;
        setSessions((current) => current.map((item) => item.id === session.id ? { ...item, slides } : item));
      } catch (error) { console.error("Supabase slide refresh failed", error); }
    };
    const connect = () => {
      try {
        const stop = subscribeToLecture(
          tracked.id,
          tracked.materialVersionId,
          () => void refresh(tracked),
          (lecture) => applyLectureUpdate(tracked, lecture),
          () => void refreshSlides(tracked),
          asAudience
        );
        if (stop) unsubscribe.push(stop);
      } catch (error) { console.error("Supabase authentication failed", error); }
    };
    // fetchOwnedSessions/fetchLiveSession already returned an authoritative snapshot.
    // Re-fetching every lecture here caused O(lecture count) duplicate REST traffic.
    connect();
    if (asAudience) {
      statusPoll = setInterval(() => {
        // 다른 작성자의 questions 행은 RLS 때문에 Postgres Changes 이벤트가 오지
        // 않을 수 있다. 공개 RPC 스냅샷으로 공감 순서와 종료 상태를 함께 보정한다.
        void refresh(sessionsByIdRef.current.get(tracked.id) ?? tracked);
      }, PARTICIPANT_STATUS_POLL_MS);
    }
    return () => {
      active = false;
      if (statusPoll) clearInterval(statusPoll);
      unsubscribe.forEach((stop) => stop());
    };
    // Session question changes do not recreate subscriptions; only the stable id set does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, subscriptionKey]);

  useEffect(() => {
    if (!ready) return;
    if (classSessionPersistenceEnabled) {
      if (ownerId.current) window.localStorage.setItem(cacheKey(ownerId.current), JSON.stringify(sessions));
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    demoChannelRef.current?.postMessage(sessions);
  }, [sessions, ready]);

  useEffect(() => {
    if (!ready) return;
    if (classSessionPersistenceEnabled) {
      if (ownerId.current) window.localStorage.setItem(folderCacheKey(ownerId.current), JSON.stringify(folders));
      return;
    }
    window.localStorage.setItem(FOLDER_STORAGE_KEY, JSON.stringify(folders));
  }, [folders, ready]);

  useEffect(() => {
    if (classSessionPersistenceEnabled) return;
    const channel = new BroadcastChannel("pin-class-live");
    // 같은 연결로 보내야 이 탭의 이전 상태를 스스로 수신하지 않는다.
    demoChannelRef.current = channel;
    channel.onmessage = (event) => setSessions((current) => {
      const next = normalizeSessions(event.data as ClassSession[]);
      return JSON.stringify(current) === JSON.stringify(next) ? current : next;
    });
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue) setSessions(normalizeSessions(JSON.parse(event.newValue)));
      if (event.key === FOLDER_STORAGE_KEY) setFolders(readFolders(FOLDER_STORAGE_KEY));
    };
    window.addEventListener("storage", onStorage);
    return () => { demoChannelRef.current = null; channel.close(); window.removeEventListener("storage", onStorage); };
  }, []);

  const createFolder = useCallback(async (name: string) => {
    const normalizedName = normalizeClassFolderName(name);
    const colorIndex = classFolderColorIndexForOrder(folders.length);
    const folder = classSessionPersistenceEnabled
      ? await persistClassFolder(normalizedName, colorIndex)
      : { id: crypto.randomUUID(), name: normalizedName, createdAt: new Date().toISOString(), colorIndex };
    setFolders((current) => [...current, folder]);
    return folder;
  }, [folders.length]);

  const createSession = useCallback(async (input: { folderId: string | null; title: string; fileName: string; slides: Slide[]; sourcePath?: string }) => {
    if (input.folderId !== null && !foldersById.has(input.folderId)) {
      throw new Error("강의 자료를 추가할 폴더를 찾지 못했습니다.");
    }
    const materialVersionId = crypto.randomUUID();
    const session: ClassSession = {
      id: crypto.randomUUID(), courseId: crypto.randomUUID(), materialId: crypto.randomUUID(), materialVersionId,
      folderId: input.folderId,
      code: makeCode(), title: input.title, fileName: input.fileName,
      status: "live", currentSlide: 0, presentationInteractions: true, showQuestionPins: true, showPresentationQr: true, presentationQrPosition: "bottom-right",
      questionCategories: defaultQuestionCategorySettings(),
      createdAt: new Date().toISOString(), slides: input.slides, questions: []
    };
    if (classSessionPersistenceEnabled) await persistSession(session, input.sourcePath);
    setSessions((current) => [session, ...current]);
    return session;
  }, [foldersById]);

  const updateSession = useCallback((id: string, fn: (session: ClassSession) => ClassSession) => {
    setSessions((current) => current.map((session) => session.id === id ? fn(session) : session));
  }, []);

  const saveLectureSettings = useCallback(async (
    sessionId: string,
    target: LectureSettingPatch,
    rollback: LectureSettingPatch,
    values: Parameters<typeof updateLecture>[1]
  ) => {
    lectureSettingTargets.current.set(sessionId, { ...lectureSettingTargets.current.get(sessionId), ...target });
    updateSession(sessionId, (session) => ({ ...session, ...target }));
    try {
      if (classSessionPersistenceEnabled) await updateLecture(sessionId, values);
    } catch (error) {
      updateSession(sessionId, (session) => ({ ...session, ...rollback }));
      throw error;
    } finally {
      // 이미 시작된 Realtime 조회가 낙관적으로 반영한 값을 되돌리지 못하게 한다.
      refreshSequences.current.set(sessionId, (refreshSequences.current.get(sessionId) ?? 0) + 1);
      const remaining = { ...lectureSettingTargets.current.get(sessionId) };
      (Object.keys(target) as Array<keyof LectureSettingPatch>).forEach((key) => {
        if (remaining[key] === target[key]) delete remaining[key];
      });
      if (Object.keys(remaining).length) lectureSettingTargets.current.set(sessionId, remaining);
      else lectureSettingTargets.current.delete(sessionId);
    }
  }, [updateSession]);

  const loadLiveSession = useCallback((
    key: string,
    existing: ClassSession | undefined,
    fetcher: () => Promise<ClassSession | null>
  ) => {
    if (existing) return Promise.resolve(existing);
    const inflight = lookups.current.get(key);
    if (inflight) return inflight;
    const lookup = fetcher()
      .then((remote) => {
        if (remote) setSessions((current) => current.some((session) => session.id === remote.id) ? current : [remote, ...current]);
        return remote;
      })
      .finally(() => lookups.current.delete(key));
    lookups.current.set(key, lookup);
    return lookup;
  }, []);

  const value = useMemo<Store>(() => ({
    ready,
    sessions,
    folders,
    createFolder,
    renameFolder: async (folderId, name) => {
      if (!foldersById.has(folderId)) throw new Error("이름을 바꿀 폴더를 찾지 못했습니다.");
      const normalizedName = normalizeClassFolderName(name);
      if (classSessionPersistenceEnabled) await persistClassFolderName(folderId, normalizedName);
      setFolders((current) => current.map((folder) => folder.id === folderId ? { ...folder, name: normalizedName } : folder));
    },
    deleteFolder: async (folderId) => {
      if (!foldersById.has(folderId)) throw new Error("삭제할 폴더를 찾지 못했습니다.");
      if (classSessionPersistenceEnabled) await persistClassFolderDeletion(folderId);
      setFolders((current) => current.filter((folder) => folder.id !== folderId));
      setSessions((current) => current.map((session) => session.folderId === folderId ? { ...session, folderId: null } : session));
    },
    moveSessionToFolder: async (sessionId, folderId) => {
      const session = sessionsById.get(sessionId);
      if (!session) throw new Error("이동할 강의 자료를 찾지 못했습니다.");
      if (folderId !== null && !foldersById.has(folderId)) throw new Error("이동할 폴더를 찾지 못했습니다.");
      if (session.folderId === folderId) return;
      if (classSessionPersistenceEnabled) {
        if (!session.courseId) throw new Error("강의 자료의 저장 정보를 찾지 못했습니다.");
        await persistSessionFolder(session.courseId, folderId);
      }
      updateSession(sessionId, (current) => ({ ...current, folderId }));
    },
    createSession,
    deleteSession: async (sessionId) => {
      const session = sessionsById.get(sessionId);
      if (!session) throw new Error("삭제할 강의 자료를 찾지 못했습니다.");
      if (classSessionPersistenceEnabled) {
        if (!session.courseId) throw new Error("강의 자료의 저장 정보를 찾지 못했습니다.");
        await persistSessionDeletion(session.courseId);
      }
      setSessions((current) => current.filter((item) => item.id !== sessionId));
    },
    appendSlides: async (sessionId, files) => {
      const session = sessionsById.get(sessionId);
      if (!session) throw new Error("슬라이드를 추가할 강의를 찾지 못했습니다.");
      validateSlideImages(files);
      const appended = classSessionPersistenceEnabled
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
      const session = sessionsById.get(sessionId);
      if (!session) throw new Error("슬라이드를 삭제할 강의를 찾지 못했습니다.");
      const deletedIndex = session.slides.findIndex((slide) => slide.id === slideId);
      if (deletedIndex < 0) throw new Error("삭제할 슬라이드를 찾지 못했습니다.");
      if (session.slides.length <= 1) throw new Error("마지막 슬라이드는 삭제할 수 없습니다.");

      if (classSessionPersistenceEnabled) {
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
      const session = sessionsById.get(sessionId);
      if (!session) throw new Error("질문을 남길 강의를 찾지 못했습니다.");
      if (!isParticipantPointAnchor(input)) throw new Error("참여자 질문은 PIN 위치에만 남길 수 있습니다.");
      const question: Question = {
        ...input,
        id: crypto.randomUUID(),
        sessionId,
        status: "unanswered",
        isMine: true,
        reactionCount: 0,
        reactedByMe: false,
        createdAt: new Date().toISOString()
      };
      if (classSessionPersistenceEnabled) await submitQuestion(session, question);
      updateSession(sessionId, (current) => ({
        ...current,
        questions: current.questions.some((item) => item.id === question.id)
          ? current.questions.map((item) => item.id === question.id ? question : item)
          : [question, ...current.questions]
      }));
    },
    updateQuestion: async (sessionId, questionId, values) => {
      if (classSessionPersistenceEnabled) await persistQuestionUpdate(questionId, values);
      updateSession(sessionId, (session) => ({
        ...session,
        questions: session.questions.map((question) => question.id === questionId ? { ...question, ...values } : question)
      }));
    },
    reactToQuestion: async (sessionId, questionId, reacted) => {
      const question = sessionsById.get(sessionId)?.questions.find((item) => item.id === questionId);
      if (!question || question.isMine || question.reactedByMe === reacted) return;
      updateSession(sessionId, (session) => ({
        ...session,
        questions: session.questions.map((item) => item.id === questionId ? withQuestionReaction(item, reacted) : item)
      }));
      try {
        if (classSessionPersistenceEnabled) await persistQuestionReaction(questionId, reacted);
      } catch (error) {
        updateSession(sessionId, (session) => ({
          ...session,
          questions: session.questions.map((item) => item.id === questionId && item.reactedByMe === reacted
            ? withQuestionReaction(item, !reacted)
            : item)
        }));
        throw error;
      }
    },
    answerQuestion: async (sessionId, questionId, answer) => {
      if (classSessionPersistenceEnabled) await postAnswer(questionId, answer);
      updateSession(sessionId, (session) => ({ ...session, questions: session.questions.map((q) => q.id === questionId ? { ...q, answer, status: "answered" } : q) }));
    },
    resolveQuestion: async (sessionId, questionId) => {
      if (classSessionPersistenceEnabled) await markQuestionResolved(questionId);
      updateSession(sessionId, (session) => ({ ...session, questions: session.questions.map((q) => q.id === questionId ? { ...q, status: "resolved" } : q) }));
    },
    setCurrentSlide: async (sessionId, currentSlide) => {
      const session = sessionsById.get(sessionId);
      if (!session) throw new Error("슬라이드를 변경할 강의를 찾지 못했습니다.");
      const nextSlide = Math.min(Math.max(0, currentSlide), Math.max(0, session.slides.length - 1));
      const previousSlide = session.currentSlide;

      // 화면은 즉시 마지막 입력을 반영하고, DB에는 현재 처리 중인 값과 마지막 목표만
      // 저장한다. 빠른 입력 사이의 모든 중간 페이지를 순서대로 쓰지 않는다.
      slideTargets.current.set(sessionId, nextSlide);
      updateSession(sessionId, (current) => ({ ...current, currentSlide: nextSlide }));
      if (!classSessionPersistenceEnabled) {
        slideTargets.current.delete(sessionId);
        return;
      }

      let write = slideWrites.current.get(sessionId);
      if (!write) {
        write = (async () => {
          let savedSlide = previousSlide;
          try {
            while (true) {
              const target = slideTargets.current.get(sessionId);
              if (target === undefined) return;
              await updateLecture(sessionId, { current_page: target });
              savedSlide = target;
              if (slideTargets.current.get(sessionId) === target) return;
            }
          } catch (error) {
            updateSession(sessionId, (current) => ({ ...current, currentSlide: savedSlide }));
            throw error;
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
      const previous = sessionsById.get(sessionId)?.status;
      if (!previous) throw new Error("상태를 변경할 강의를 찾지 못했습니다.");
      await saveLectureSettings(sessionId, { status }, { status: previous }, { status });
    },
    setShowQuestionPins: async (sessionId, visible) => {
      const previous = sessionsById.get(sessionId)?.showQuestionPins;
      if (previous === undefined) throw new Error("설정을 변경할 강의를 찾지 못했습니다.");
      await saveLectureSettings(sessionId, { showQuestionPins: visible }, { showQuestionPins: previous }, { show_question_pins: visible });
    },
    setPresentationQrPlacement: async (sessionId, position) => {
      const previous = sessionsById.get(sessionId);
      if (!previous) throw new Error("설정을 변경할 강의를 찾지 못했습니다.");
      const showPresentationQr = position !== null;
      const presentationQrPosition = position ?? previous.presentationQrPosition;
      if (previous.showPresentationQr === showPresentationQr && previous.presentationQrPosition === presentationQrPosition) return;
      await saveLectureSettings(
        sessionId,
        { showPresentationQr, presentationQrPosition },
        { showPresentationQr: previous.showPresentationQr, presentationQrPosition: previous.presentationQrPosition },
        { show_presentation_qr: showPresentationQr, presentation_qr_position: presentationQrPosition }
      );
    },
    setQuestionCategories: async (sessionId, settings) => {
      if (classSessionPersistenceEnabled) await updateLecture(sessionId, { question_categories: settings });
      updateSession(sessionId, (session) => ({ ...session, questionCategories: settings }));
    },
    updateSlideNote: async (sessionId, slideId, body) => {
      if (classSessionPersistenceEnabled) await saveSlideInstructorNote(slideId, body);
      updateSession(sessionId, (session) => ({
        ...session,
        slides: session.slides.map((slide) => slide.id === slideId ? { ...slide, speakerNote: body } : slide)
      }));
    },
    setActiveSession: setActiveSessionId,
    loadSessionByCode: (code) => loadLiveSession(
      `code:${code.toLowerCase()}`,
      sessionsByCode.get(code.toLowerCase()),
      () => fetchLiveSession(code)
    ),
    loadSessionById: (sessionId) => loadLiveSession(
      `id:${sessionId}`,
      sessionsById.get(sessionId),
      () => fetchLiveSessionById(sessionId)
    )
  }), [createFolder, createSession, folders, foldersById, loadLiveSession, ready, saveLectureSettings, sessions, sessionsByCode, sessionsById, updateSession]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessions() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSessions must be used inside SessionStore");
  return value;
}
