"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-context";
import { LanguageSwitcher, useLanguage } from "@/components/language-context";
import { isPublicPlayerPath } from "@/lib/pin/routes";

/**
 * 관리자 화면 가드. 피드백 앱은 기준 이미지를 Storage 에 올려야 성립하므로
 * 강의 앱과 달리 demo 모드를 통과시키지 않고 설정이 필요하다고 알린다.
 */
export default function PinAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { t } = useLanguage();
  const pathname = usePathname();
  const { configured, loading, isAdmin } = useAuth();
  const publicPlayer = isPublicPlayerPath(pathname);

  useEffect(() => {
    if (!publicPlayer && configured && !loading && !isAdmin) router.replace(`/pin/login?next=${encodeURIComponent(pathname)}`);
  }, [configured, loading, isAdmin, pathname, publicPlayer, router]);

  if (publicPlayer) return <>{children}</>;
  if (!configured) {
    return <div className="empty-state">
      <LanguageSwitcher />
      <h1>{t("pin.supabase.title")}</h1>
      <p>{t("pin.supabase.adminDescription")}</p>
      <button className="btn primary" onClick={() => router.push("/pin")}>{t("pin.supabase.home")}</button>
    </div>;
  }
  if (loading || !isAdmin) return <div className="loading-screen"><span className="spinner dark" /></div>;
  return <>{children}</>;
}
