import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Profile } from "@/lib/types";

let browserClient: SupabaseClient | null = null;
let anonymousSignInPromise: ReturnType<SupabaseClient["auth"]["signInAnonymously"]> | null = null;

export const supabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_DATA_MODE === "supabase" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

export function getSupabaseClient() {
  if (!supabaseConfigured) return null;
  if (!browserClient) {
    browserClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      // detectSessionInUrl: /auth/callback 으로 돌아온 첫 로드에서 ?code= 를 세션으로 교환한다.
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" } }
    );
  }
  return browserClient;
}

/** 현재 세션 사용자. 없다고 해서 익명 세션을 만들지는 않는다. */
export async function getSessionUser(): Promise<User | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.user ?? null;
}

/**
 * /api/convert 가 업로드를 사용자 폴더에 넣으려면 누가 보냈는지 알아야 한다.
 * 업로드는 로그인한 강사 전용이므로 익명 세션으로 대체하지 않는다.
 */
export async function getAccessToken() {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  if (!data.session || data.session.user.is_anonymous) return null;
  return data.session.access_token ?? null;
}

export async function signInWithGoogle(next = "/") {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 모드에서만 로그인할 수 있습니다.");
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const { error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  if (error) throw error;
}

export async function signOutUser() {
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function fetchOwnProfile(userId: string): Promise<Profile | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.from("profiles")
    .select("id, role, email, display_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, role: data.role, email: data.email, displayName: data.display_name, avatarUrl: data.avatar_url };
}

/** 수강생(QR 참여) 전용 — 세션이 없으면 익명으로 만들어 준다. */
export async function ensureAnonymousUser() {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  if (data.session?.user) return data.session.user;
  if (!anonymousSignInPromise) anonymousSignInPromise = client.auth.signInAnonymously();
  try {
    const { data: signedIn, error } = await anonymousSignInPromise;
    if (error) throw error;
    return signedIn.user;
  } finally {
    anonymousSignInPromise = null;
  }
}
