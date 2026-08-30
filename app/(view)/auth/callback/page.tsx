"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/app/_infrastructure/supabase/client";
import { useLanguage } from "@/app/_controller/language-context";
import { LoadingScreen } from "@/app/component/loading-screen";

/**
 * 구글에서 돌아오는 자리. 클라이언트가 URL 의 ?code= 를 세션으로 교환하는 동안
 * 기다렸다가 원래 가려던 곳(next)으로 보낸다.
 */
function CallbackContent() {
  const { t } = useLanguage();
  const router = useRouter();
  const params = useSearchParams();
  const [timedOut, setTimedOut] = useState(false);
  const oauthError = params.get("error_description") || params.get("error");
  const failed = oauthError ?? (timedOut ? t("login.timeout") : null);

  useEffect(() => {
    if (oauthError) return;
    const requestedNext = params.get("next");
    const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/admin/dashboard";
    const client = getSupabaseClient();
    if (!client) { router.replace("/admin/dashboard"); return; }
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
      <LoadingScreen>
        <p className="login-error" role="alert">{failed}</p>
        <Link className="btn primary" href="/login">{t("login.retry")}</Link>
      </LoadingScreen>
    );
  }
  return <LoadingScreen />;
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <CallbackContent />
    </Suspense>
  );
}
