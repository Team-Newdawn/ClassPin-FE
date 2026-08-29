"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/lib/types";
import { fetchOwnProfile, getSupabaseClient, setOwnerAccessToken, signInWithGoogle, signOutUser, supabaseConfigured } from "@/lib/supabase/client";

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
  const [loading, setLoading] = useState(supabaseConfigured);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    let active = true;
    const apply = async (nextUser: User | null) => {
      if (!active) return;
      setUser(nextUser);
      // 익명 수강생은 participant 고정이라 프로필까지 읽을 필요가 없다.
      if (nextUser && !nextUser.is_anonymous) {
        try {
          const nextProfile = await fetchOwnProfile(nextUser.id);
          if (active) setProfile(nextProfile);
        } catch (error) {
          // PostgrestError 는 콘솔에서 {} 로 뭉개져 message 를 따로 찍는다.
          const detail = (error as { message?: string })?.message ?? String(error);
          console.error(`Profile fetch failed: ${detail}`, error);
          if (active) setProfile(null);
        }
      } else if (active) setProfile(null);
      if (active) setLoading(false);
    };
    void client.auth.getSession().then(({ data }) => {
      setOwnerAccessToken(data.session?.access_token ?? null);
      void apply(data.session?.user ?? null);
    });
    // 콜백 안에서 바로 supabase 호출을 하면 auth 락과 엉킬 수 있어 다음 틱으로 미룬다.
    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      setOwnerAccessToken(session?.access_token ?? null);
      setTimeout(() => void apply(session?.user ?? null), 0);
    });
    return () => { active = false; subscription.subscription.unsubscribe(); };
  }, []);

  const value = useMemo<AuthState>(() => ({
    configured: supabaseConfigured,
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
