"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  classSessionPersistenceEnabled,
  controlLectureRemote,
  getLectureRemoteHolder,
  issueLectureRemote,
  type LectureRemoteHolder,
  type LectureRemoteSettings,
  type LectureRemoteState
} from "@/app/_service/class-session-service";

// ponytail: 5초 폴링. 리모컨은 강의당 1대라 부하가 작다. 즉시 반영이 필요해지면 lectures Realtime 구독으로 바꾼다.
const REMOTE_POLL_MS = 5000;

/** 데모 모드에는 서버가 없어 리모컨을 발급할 수 없다. */
export const lectureRemoteAvailable = classSessionPersistenceEnabled;

const errorMessage = (error: unknown) => error && typeof error === "object" && "message" in error ? String(error.message) : String(error);

/** owner의 리모컨 대화상자. 토큰은 대화상자가 열려 있는 동안만 메모리에 둔다. */
export function useLectureRemoteIssuer(sessionId: string) {
  const [holder, setHolder] = useState<LectureRemoteHolder | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const refresh = () => getLectureRemoteHolder(sessionId).then(setHolder, (error) => {
      console.error(`Remote status failed: ${errorMessage(error)}`, error);
      setFailed(true);
    });
    void refresh();
    const interval = window.setInterval(refresh, REMOTE_POLL_MS);
    return () => window.clearInterval(interval);
  }, [sessionId]);

  const url = token ? `${window.location.origin}/remote#${token}` : "";
  return {
    holder,
    url,
    busy,
    failed,
    copied,
    // 발급 중에 버튼을 disabled로 바꾸면 포커스가 body로 빠져 대화상자 포커스 가두기·Esc가 풀린다. 중복 클릭만 무시한다.
    issue: async () => {
      if (busy) return;
      setBusy(true);
      setFailed(false);
      setCopied(false);
      try {
        setToken(await issueLectureRemote(sessionId));
        setHolder("waiting");
      } catch (error) {
        console.error(`Remote issue failed: ${errorMessage(error)}`, error);
        setFailed(true);
      } finally {
        setBusy(false);
      }
    },
    copy: async () => {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };
}

const subscribeHash = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

/** `/remote#{token}` 화면. 토큰은 서버 로그·Referer에 남지 않도록 fragment에서만 읽는다. */
export function useLectureRemote() {
  const token = useSyncExternalStore(subscribeHash, () => window.location.hash.slice(1), () => null);
  const initialView = { token, lecture: null as LectureRemoteState | null, blocked: null as "inUse" | "revoked" | null, syncError: false, busy: false, questionsOpen: false };
  const [view, setView] = useState(initialView);
  if (view.token !== token) setView(initialView);
  const { lecture, blocked, syncError, busy, questionsOpen } = view;
  const latestRequestRef = useRef(0);
  const writeBusyRef = useRef(false);

  const send = useCallback((step: -1 | 0 | 1, settings: LectureRemoteSettings = {}) => {
    if (!token || writeBusyRef.current) return;
    const writing = step !== 0 || Object.keys(settings).length > 0;
    if (writing) writeBusyRef.current = true;
    const request = ++latestRequestRef.current;
    const apply = (change: Partial<typeof view>) => {
      if (request === latestRequestRef.current) setView((current) => current.token === token ? { ...current, ...change } : current);
    };
    void controlLectureRemote(token, step, settings, questionsOpen).then((next) => apply({ lecture: next, syncError: false }), (error) => {
      const message = errorMessage(error);
      if (message === "remote_in_use") apply({ blocked: "inUse" });
      else if (message === "remote_revoked") apply({ blocked: "revoked" });
      else {
        console.error(`Remote control failed: ${message}`, error);
        apply({ syncError: true });
      }
    }).finally(() => {
      if (writing) {
        writeBusyRef.current = false;
        apply({ busy: false });
      }
    });
  }, [questionsOpen, token]);

  useEffect(() => {
    if (!token || blocked) return;
    send(0);
    const refresh = () => { if (document.visibilityState === "visible") send(0); };
    const interval = window.setInterval(refresh, REMOTE_POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [blocked, send, token]);

  const state = token === null ? "loading"
    : token === "" ? "revoked"
      : blocked ?? (lecture ? "ready" : syncError ? "offline" : "loading");
  const write = (step: -1 | 0 | 1, settings: LectureRemoteSettings = {}) => {
    if (!token || writeBusyRef.current) return;
    setView((current) => ({ ...current, busy: true }));
    send(step, settings);
  };
  return {
    state, lecture, syncError, busy, questionsOpen,
    previous: () => write(-1), next: () => write(1),
    changeSettings: (settings: LectureRemoteSettings) => write(0, settings),
    setQuestionsOpen: (open: boolean) => setView((current) => ({ ...current, questionsOpen: open })),
  };
}
