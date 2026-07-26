"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth-context";
import type { ClassSession, Question, Slide } from "@/lib/types";
import { getSupabaseClient, supabaseConfigured } from "@/lib/supabase/client";
import { fetchLectureSnapshot, fetchLiveSession, fetchOwnedSessions, markQuestionResolved, persistSession, postAnswer, submitQuestion, subscribeToLecture, updateLecture, updateQuestion as persistQuestionUpdate } from "@/lib/supabase/repository";

const STORAGE_KEY = "pin-class-sessions-v1";
const SUPABASE_CACHE_PREFIX = "pin-class-sessions-cache-v2";
// 예전 빌드가 시드로 심어 둔 데모 세션. 저장본에 남아 있으면 첫 로드에서 걷어낸다.
const DEMO_SESSION_ID = "demo-session";

type Store = {
  ready: boolean;
  sessions: ClassSession[];
  createSession: (input: { title: string; fileName: string; slides: Slide[] }) => Promise<ClassSession>;
  addQuestion: (sessionId: string, question: Omit<Question, "id" | "sessionId" | "createdAt" | "status">) => Promise<void>;
  updateQuestion: (sessionId: string, questionId: string, values: Pick<Question, "category" | "text">) => Promise<void>;
  answerQuestion: (sessionId: string, questionId: string, answer: string) => Promise<void>;
  resolveQuestion: (sessionId: string, questionId: string) => Promise<void>;
  setCurrentSlide: (sessionId: string, slide: number) => Promise<void>;
  setStatus: (sessionId: string, status: ClassSession["status"]) => Promise<void>;
  loadSessionByCode: (code: string) => Promise<ClassSession | null>;
};

const SessionContext = createContext<Store | null>(null);

const makeCode = () => `PIN${Math.floor(100 + Math.random() * 900)}`;
const cacheKey = (userId: string) => `${SUPABASE_CACHE_PREFIX}:${userId}`;

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
  const unique = list.filter((session) => {
    if (seen.has(session.id)) return false;
    seen.add(session.id);
    return true;
  });
  return unique.length === list.length ? list : unique;
};

export function SessionStore({ children }: { children: React.ReactNode }) {
  const { loading: authLoading, user, isAdmin } = useAuth();
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [ready, setReady] = useState(false);
  const lookups = useRef(new Map<string, Promise<ClassSession | null>>());
  const ownerId = useRef<string | null>(null);
  const authUserId = user?.id ?? null;
  const authIsAnonymous = user?.is_anonymous ?? false;

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
    let active = true;
    const channels: NonNullable<ReturnType<typeof subscribeToLecture>>[] = [];
    const refresh = async (session: ClassSession) => {
      try {
        const snapshot = await fetchLectureSnapshot(session);
        if (!active || !snapshot) return;
        setSessions((current) => current.map((item) => item.id === session.id ? { ...item, ...snapshot } : item));
      } catch (error) { console.error("Supabase realtime refresh failed", error); }
    };
    const connect = async () => {
      try {
        await Promise.all(tracked.map(refresh));
        if (!active) return;
        tracked.forEach((session) => {
          const channel = subscribeToLecture(session.id, () => void refresh(session));
          if (channel) channels.push(channel);
        });
      } catch (error) { console.error("Supabase authentication failed", error); }
    };
    void connect();
    return () => {
      active = false;
      const client = getSupabaseClient();
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
      status: "live", currentSlide: 0, createdAt: new Date().toISOString(), slides: input.slides, questions: []
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
      // 답변을 보내는 것도 해결 처리다. 두 동작 모두 같은 resolved 로 끝난다.
      updateSession(sessionId, (session) => ({ ...session, questions: session.questions.map((q) => q.id === questionId ? { ...q, answer, status: "resolved" } : q) }));
    },
    resolveQuestion: async (sessionId, questionId) => {
      if (supabaseConfigured) await markQuestionResolved(questionId);
      updateSession(sessionId, (session) => ({ ...session, questions: session.questions.map((q) => q.id === questionId ? { ...q, status: "resolved" } : q) }));
    },
    setCurrentSlide: async (sessionId, currentSlide) => {
      if (supabaseConfigured) await updateLecture(sessionId, { current_page: currentSlide });
      updateSession(sessionId, (session) => ({ ...session, currentSlide }));
    },
    setStatus: async (sessionId, status) => {
      if (supabaseConfigured) await updateLecture(sessionId, { status });
      updateSession(sessionId, (session) => ({ ...session, status }));
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
