"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Grid2X2, LogOut, MoreHorizontal } from "@/components/icons";
import { useAuth } from "@/components/auth-context";
import { PinLogo } from "@/components/pin-logo";

export function PinAdminSidebar() {
  const pathname = usePathname();
  const { configured, profile, signOut } = useAuth();
  const name = profile?.displayName ?? profile?.email ?? "내 워크스페이스";
  const items = [
    {
      href: "/pin/admin",
      label: "캠페인",
      icon: Grid2X2,
      active: pathname === "/pin/admin" || pathname.startsWith("/pin/admin/")
    }
  ];

  return (
    <aside className="sidebar pin-admin-sidebar">
      <div className="sidebar-logo"><PinLogo href="/pin" product="" label="Pin 홈" /></div>
      <nav>
        {items.map(({ href, label, icon: Icon, active }) => (
          <Link key={label} href={href} className={`nav-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}><Icon />{label}</Link>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <span className="avatar">{name.slice(0, 2).toUpperCase()}</span>
        <span><b>{name}</b><small>{profile?.email ?? "개인 워크스페이스"}</small></span>
        {configured
          ? <button className="logout-btn" title="로그아웃" onClick={() => void signOut().catch((error) => console.error("Sign out failed", error))}><LogOut /></button>
          : <MoreHorizontal />}
      </div>
    </aside>
  );
}

export function PinAdminShell({ children }: { children: React.ReactNode }) {
  return <div className="app-shell"><PinAdminSidebar /><main className="admin-main">{children}</main></div>;
}
