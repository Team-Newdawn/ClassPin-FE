"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { demoSession } from "@/lib/demo-data";
import type { ClassSession, Question, Slide } from "@/lib/types";
import { ensureAnonymousUser, getSupabaseClient, supabaseConfigured } from "@/lib/supabase/client";
import { fetchLectureSnapshot, fetchLiveSession, markQuestionResolved, persistSession, postAnswer, submitQuestion, subscribeToLecture, updateLecture } from "@/lib/supabase/repository";

const STORAGE_KEY = "pin-class-sessions-v1";

type Store = {
  ready: boolean;
  sessions: ClassSession[];
  createSession: (input: { title: string; fileName: string; slides: Slide[] }) => ClassSession;
  addQuestion: (sessionId: string, question: Omit<Question, "id" | "sessionId" | "createdAt" | "status">) => void;
  answerQuestion: (sessionId: string, questionId: string, answer: string) => void;
  resolveQuestion: (sessionId: string, questionId: string) => void;
  setCurrentSlide: (sessionId: string, slide: number) => void;
  setStatus: (sessionId: string, status: ClassSession["status"]) => void;
  loadSessionByCode: (code: string) => Promise<ClassSession | null>;
};

const SessionContext = createContext<Store | null>(null);

const makeCode = () => `PIN${Math.floor(100 + Math.random() * 900)}`;

export function SessionStore({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    queueMicrotask(() => {
      setSessions(stored ? JSON.parse(stored) : [demoSession]);
      setReady(true);
    });
  }, []);

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
        await ensureAnonymousUser();
        if (!active) return;
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    const channel = new BroadcastChannel("pin-class-live");
    channel.postMessage(sessions);
    channel.close();
  }, [sessions, ready]);

  useEffect(() => {
    const channel = new BroadcastChannel("pin-class-live");
    channel.onmessage = (event) => setSessions((current) => JSON.stringify(current) === JSON.stringify(event.data) ? current : event.data as ClassSession[]);
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue) setSessions(JSON.parse(event.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => { channel.close(); window.removeEventListener("storage", onStorage); };
  }, []);

  const createSession = useCallback((input: { title: string; fileName: string; slides: Slide[] }) => {
    const materialVersionId = crypto.randomUUID();
    const session: ClassSession = {
      id: crypto.randomUUID(), courseId: crypto.randomUUID(), materialId: crypto.randomUUID(), materialVersionId,
      code: makeCode(), title: input.title, fileName: input.fileName,
      status: "live", currentSlide: 0, createdAt: new Date().toISOString(), slides: input.slides, questions: []
    };
    setSessions((current) => [session, ...current]);
    if (supabaseConfigured) void persistSession(session).catch((error) => console.error("Supabase session sync failed", error));
    return session;
  }, []);

  const updateSession = useCallback((id: string, fn: (session: ClassSession) => ClassSession) => {
    setSessions((current) => current.map((session) => session.id === id ? fn(session) : session));
  }, []);

  const value = useMemo<Store>(() => ({
    ready,
    sessions,
    createSession,
    addQuestion: (sessionId, input) => {
      const session = sessions.find((item) => item.id === sessionId);
      const question: Question = { ...input, id: crypto.randomUUID(), sessionId, status: "unanswered", createdAt: new Date().toISOString() };
      updateSession(sessionId, (current) => ({ ...current, questions: [question, ...current.questions] }));
      if (supabaseConfigured && session?.courseId) void submitQuestion(session, question).catch((error) => console.error("Supabase question sync failed", error));
    },
    answerQuestion: (sessionId, questionId, answer) => {
      updateSession(sessionId, (session) => ({ ...session, questions: session.questions.map((q) => q.id === questionId ? { ...q, answer, status: "answered" } : q) }));
      if (supabaseConfigured) void postAnswer(questionId, answer).catch((error) => console.error("Supabase answer sync failed", error));
    },
    resolveQuestion: (sessionId, questionId) => {
      updateSession(sessionId, (session) => ({ ...session, questions: session.questions.map((q) => q.id === questionId ? { ...q, status: "resolved" } : q) }));
      if (supabaseConfigured) void markQuestionResolved(questionId).catch((error) => console.error("Supabase question update failed", error));
    },
    setCurrentSlide: (sessionId, currentSlide) => {
      updateSession(sessionId, (session) => ({ ...session, currentSlide }));
      if (supabaseConfigured) void updateLecture(sessionId, { current_page: currentSlide }).catch((error) => console.error("Supabase slide sync failed", error));
    },
    setStatus: (sessionId, status) => {
      updateSession(sessionId, (session) => ({ ...session, status }));
      if (supabaseConfigured) void updateLecture(sessionId, { status }).catch((error) => console.error("Supabase status sync failed", error));
    },
    loadSessionByCode: async (code) => {
      const existing = sessions.find((session) => session.code.toLowerCase() === code.toLowerCase());
      if (existing) return existing;
      const remote = await fetchLiveSession(code);
      if (remote) setSessions((current) => [remote, ...current]);
      return remote;
    }
  }), [createSession, ready, sessions, updateSession]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessions() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSessions must be used inside SessionStore");
  return value;
}
