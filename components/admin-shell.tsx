"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Grid2X2, LayoutDashboard, LogOut, MoreHorizontal, Play } from "@/components/icons";
import { useAuth } from "@/components/auth-context";
import { LanguageSwitcher, useLanguage } from "@/components/language-context";
import { PinLogo } from "@/components/pin-logo";
import { useSessions } from "@/components/session-store";

export function AdminSidebar() {
  const { t } = useLanguage();
  const pathname = usePathname();
  const { sessions } = useSessions();
  const { configured, profile, signOut } = useAuth();
  const name = profile?.displayName ?? profile?.email ?? t("nav.myWorkspace");
  const liveSession = sessions.find((session) => session.status === "live") ?? sessions[0];
  const items = [
    { href: "/admin/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard, active: pathname.startsWith("/admin/dashboard") },
    { href: liveSession ? `/admin/session/${liveSession.id}` : "/", label: t("nav.liveSession"), icon: Play, active: pathname.startsWith("/admin/session") },
    { href: "/admin/materials", label: t("nav.materials"), icon: Grid2X2, active: pathname.startsWith("/admin/materials") },
    { href: "/admin/insights", label: t("nav.insights"), icon: BarChart3, active: pathname.startsWith("/admin/insights") }
  ];

  return (
    <aside className="sidebar">
      {/* PinLogo 가 이미 홈으로 가는 Link 다. 한 번 더 감싸면 a 안의 a 가 된다. */}
      <div className="sidebar-logo"><PinLogo /></div>
      <nav>
        {items.map(({ href, label, icon: Icon, active }) => (
          <Link key={label} href={href} className={`nav-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}><Icon />{label}</Link>
        ))}
      </nav>
      <LanguageSwitcher className="sidebar-language" />
      <div className="sidebar-bottom">
        <span className="avatar">{name.slice(0, 2).toUpperCase()}</span>
        <span><b>{name}</b><small>{profile?.email ?? t("nav.personalWorkspace")}</small></span>
        {configured
          ? <button className="logout-btn" title={t("common.logout")} aria-label={t("common.logout")} onClick={() => void signOut().catch((error) => console.error("Sign out failed", error))}><LogOut /></button>
          : <MoreHorizontal />}
      </div>
    </aside>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return <div className="app-shell"><AdminSidebar /><main className="admin-main">{children}</main></div>;
}
