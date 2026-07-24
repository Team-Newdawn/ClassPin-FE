"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * 구글에서 돌아오는 자리. 클라이언트가 URL 의 ?code= 를 세션으로 교환하는 동안
 * 기다렸다가 원래 가려던 곳(next)으로 보낸다.
 */
function CallbackContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [timedOut, setTimedOut] = useState(false);
  const oauthError = params.get("error_description") || params.get("error");
  const failed = oauthError ?? (timedOut ? "로그인 처리가 지연되고 있어요. 다시 시도해 주세요." : null);

  useEffect(() => {
    if (oauthError) return;
    const next = params.get("next") || "/";
    const client = getSupabaseClient();
    if (!client) { router.replace("/"); return; }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      router.replace(next);
    };
    void client.auth.getSession().then(({ data }) => { if (data.session) finish(); });
    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      if (session) setTimeout(finish, 0);
    });
    const timer = setTimeout(() => { if (!done) setTimedOut(true); }, 8000);
    return () => { subscription.subscription.unsubscribe(); clearTimeout(timer); };
  }, [oauthError, params, router]);

  if (failed) {
    return (
      <div className="loading-screen">
        <p className="login-error" role="alert">{failed}</p>
        <Link className="btn primary" href="/login">다시 로그인</Link>
      </div>
    );
  }
  return <div className="loading-screen"><span className="spinner dark" /></div>;
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="loading-screen"><span className="spinner dark" /></div>}>
      <CallbackContent />
    </Suspense>
  );
}
