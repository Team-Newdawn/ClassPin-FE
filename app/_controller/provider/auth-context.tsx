"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/app/_model/types";
import { authConfigured, fetchOwnProfile, observeAuthSession, signInWithGoogle, signOutUser } from "@/app/_service/auth-service";

type AuthState = {
  /** false 면 demo 모드 — 로그인 없이 모든 화면을 쓴다. */
  configured: boolean;
  loading: boolean;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  signIn: (next?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(authConfigured);

  useEffect(() => {
    let active = true;
    // 토큰 갱신마다 프로필을 다시 읽으면 일시적인 서버 오류 한 번에 강사가 로그인 화면으로 밀려난다.
    let profileLookup: { userId: string; request: Promise<Profile | null> } | null = null;
    const apply = async (nextUser: User | null) => {
      if (!active) return;
      setUser(nextUser);
      // 익명 수강생은 participant 고정이라 프로필까지 읽을 필요가 없다.
      if (nextUser && !nextUser.is_anonymous) {
        try {
          if (profileLookup?.userId !== nextUser.id) profileLookup = { userId: nextUser.id, request: fetchOwnProfile(nextUser.id) };
          const nextProfile = await profileLookup.request;
          if (active) setProfile(nextProfile);
        } catch (error) {
          profileLookup = null;
          // PostgrestError 는 콘솔에서 {} 로 뭉개져 message 를 따로 찍는다.
          const detail = (error as { message?: string })?.message ?? String(error);
          console.error(`Profile fetch failed: ${detail}`, error);
          if (active) setProfile(null);
        }
      } else if (active) setProfile(null);
      if (active) setLoading(false);
    };
    const stop = observeAuthSession((session) => void apply(session?.user ?? null));
    return () => { active = false; stop?.(); };
  }, []);

  const value = useMemo<AuthState>(() => ({
    configured: authConfigured,
    loading,
    user,
    profile,
    isAdmin: profile?.role === "admin",
    signIn: signInWithGoogle,
    signOut: signOutUser
  }), [loading, user, profile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
