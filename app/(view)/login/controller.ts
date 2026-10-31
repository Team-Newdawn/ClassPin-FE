"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/_controller/auth-context";
import { safeNextPath } from "@/app/_model/next-path";

export function useLoginController(startError: string) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const { configured, loading, isAdmin, signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (configured && !loading && isAdmin) router.replace(next);
  }, [configured, loading, isAdmin, next, router]);

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
