"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useLanguage } from "@/app/_controller/language-context";
import { LoadingScreen } from "@/app/component/loading-screen";
import { useAuthCallbackController } from "./controller";

/**
 * 구글에서 돌아오는 자리. 클라이언트가 URL 의 ?code= 를 세션으로 교환하는 동안
 * 기다렸다가 원래 가려던 곳(next)으로 보낸다.
 */
function CallbackContent() {
  const { t } = useLanguage();
  const { oauthError, timedOut } = useAuthCallbackController();
  const failed = oauthError ?? (timedOut ? t("login.timeout") : null);

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
