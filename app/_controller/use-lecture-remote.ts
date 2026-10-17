"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  classSessionPersistenceEnabled,
  controlLectureRemote,
  getLectureRemoteHolder,
  issueLectureRemote,
  type LectureRemoteHolder,
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
  // 같은 탭에서 #토큰만 바뀌어도 이전 링크의 차단·화면 상태를 끌고 오지 않도록 토큰별로 둔다.
  const [view, setView] = useState({ token, lecture: null as LectureRemoteState | null, blocked: null as "inUse" | "revoked" | null, syncError: false });
  if (view.token !== token) setView({ token, lecture: null, blocked: null, syncError: false });
  const { lecture, blocked, syncError } = view;
  const latestRequestRef = useRef(0);

  const send = useCallback((step: -1 | 0 | 1) => {
    if (!token) return;
    const request = ++latestRequestRef.current;
    const apply = (change: Partial<typeof view>) => {
      if (request === latestRequestRef.current) setView((current) => current.token === token ? { ...current, ...change } : current);
    };
    void controlLectureRemote(token, step).then((next) => apply({ lecture: next, syncError: false }), (error) => {
      const message = errorMessage(error);
      if (message === "remote_in_use") apply({ blocked: "inUse" });
      else if (message === "remote_revoked") apply({ blocked: "revoked" });
      else {
        console.error(`Remote control failed: ${message}`, error);
        apply({ syncError: true });
      }
    });
  }, [token]);

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
  return { state, lecture, syncError, previous: () => send(-1), next: () => send(1) };
}
