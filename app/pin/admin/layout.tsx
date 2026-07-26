"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-context";

/**
 * 관리자 화면 가드. 피드백 앱은 기준 이미지를 Storage 에 올려야 성립하므로
 * 강의 앱과 달리 demo 모드를 통과시키지 않고 설정이 필요하다고 알린다.
 */
export default function PinAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { configured, loading, isAdmin } = useAuth();

  useEffect(() => {
    if (configured && !loading && !isAdmin) router.replace(`/pin/login?next=${encodeURIComponent(pathname)}`);
  }, [configured, loading, isAdmin, pathname, router]);

  if (!configured) {
    return <div className="empty-state">
      <h1>Supabase 설정이 필요해요</h1>
      <p>피드백 캠페인은 이미지 저장소를 쓰기 때문에 Supabase 모드에서만 동작합니다.</p>
      <button className="btn primary" onClick={() => router.push("/pin")}>Pin 홈으로</button>
    </div>;
  }
  if (loading || !isAdmin) return <div className="loading-screen"><span className="spinner dark" /></div>;
  return <>{children}</>;
}
