"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/app/_controller/auth-context";
import { LoadingScreen } from "@/app/component/loading-screen";

/** 강사 화면 가드. demo 모드에서는 그대로 통과한다. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { configured, loading, isAdmin } = useAuth();

  useEffect(() => {
    if (configured && !loading && !isAdmin) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [configured, loading, isAdmin, pathname, router]);

  if (configured && (loading || !isAdmin)) return <LoadingScreen />;
  return <>{children}</>;
}
