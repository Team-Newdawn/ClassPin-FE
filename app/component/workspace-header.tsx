"use client";

import { LogOut } from "@/app/component/icons";
import { useAuth } from "@/app/_controller/auth-context";
import { useLanguage } from "@/app/_controller/language-context";
import { LanguageSwitcher } from "@/app/component/language-switcher";
import { PinLogo } from "@/app/component/pin-logo";
import styles from "./workspace-header.module.css";

export function WorkspaceHeader({ showLogo = true }: { showLogo?: boolean }) {
  const { t } = useLanguage();
  const { configured, profile, signOut } = useAuth();
  const name = profile?.displayName ?? profile?.email ?? t("nav.myWorkspace");

  return (
    <header className={`${styles.root} workspace-header ${showLogo ? "" : "logo-hidden"}`}>
      {showLogo && <PinLogo />}
      <div className="workspace-account">
        <LanguageSwitcher />
        <span className="avatar">{name.slice(0, 2).toUpperCase()}</span>
        <span className="workspace-account-copy"><b>{name}</b><small>{profile?.email ?? t("nav.personalWorkspace")}</small></span>
        {configured && <button type="button" className="logout-btn" title={t("common.logout")} aria-label={t("common.logout")} onClick={() => void signOut().catch((error) => console.error("Sign out failed", error))}><LogOut /></button>}
      </div>
    </header>
  );
}
