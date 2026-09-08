"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/_controller/auth-context";
import { canUseLocalDevelopmentLogin, signInForLocalDevelopment } from "@/app/_service/auth-service";

export function useLoginController(startError: string) {
  const router = useRouter();
  const params = useSearchParams();
  const requestedNext = params.get("next");
  const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/admin/dashboard";
  const { configured, loading, isAdmin, signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const localAutoLoginStarted = useRef(false);

  useEffect(() => {
    if (configured && !loading && isAdmin) router.replace(next);
  }, [configured, loading, isAdmin, next, router]);

  useEffect(() => {
    if (!configured || loading || isAdmin || localAutoLoginStarted.current || !canUseLocalDevelopmentLogin()) return;
    localAutoLoginStarted.current = true;
    void signInForLocalDevelopment().catch((cause) => {
      setError(cause instanceof Error ? cause.message : startError);
    });
  }, [configured, loading, isAdmin, startError]);

  const startGoogle = async () => {
    setError(null);
    setRedirecting(true);
    try {
      await signIn(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : startError);
      setRedirecting(false);
    }
  };

  return { configured, loading, redirecting, error, startGoogle };
}
