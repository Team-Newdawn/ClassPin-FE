"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useAuth } from "./auth-context";

const CHANGE_EVENT = "ohpin-preferences-changed";

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

function read(key: string) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function parse<T extends object>(raw: string | null): Partial<T> {
  try {
    const value = JSON.parse(raw ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

/** Browser-only appearance preferences; business data stays in the session store. */
export function useBrowserPreferences<T extends object>(scope: string) {
  const { user } = useAuth();
  const key = `ohpin-preferences:${user?.id ?? "demo"}:${scope}`;
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  const value = useMemo(() => parse<T>(raw), [raw]);
  const update = useCallback((patch: Partial<T>) => {
    window.localStorage.setItem(key, JSON.stringify({ ...parse<T>(read(key)), ...patch }));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [key]);
  return [value, update] as const;
}
