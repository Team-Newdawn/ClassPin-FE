"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authConfigured, observeAuthSession, restoreSessionFromUrlHash } from "@/app/_service/auth-service";

export function useAuthCallbackController() {
  const router = useRouter();
  const params = useSearchParams();
  const [timedOut, setTimedOut] = useState(false);
  const oauthError = params.get("error_description") || params.get("error");

  useEffect(() => {
    if (oauthError) return;
    const requestedNext = params.get("next");
    const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/admin/dashboard";
    if (!authConfigured) { router.replace("/admin/dashboard"); return; }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      router.replace(next);
    };
    let stop: (() => void) | null = null;
    void restoreSessionFromUrlHash(window.location.hash)
      .then((restored) => {
        if (restored) finish();
        else if (!done) stop = observeAuthSession((session) => { if (session) finish(); });
      })
      .catch(() => { if (!done) setTimedOut(true); });
    const timer = setTimeout(() => { if (!done) setTimedOut(true); }, 8000);
    return () => { done = true; stop?.(); clearTimeout(timer); };
  }, [oauthError, params, router]);

  return { oauthError, timedOut };
}
