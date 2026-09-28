import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Profile } from "@/app/_model/types";
import { restRequest } from "@/app/_infrastructure/rest/request";
import { fetchWithAbortedTransactionRetry } from "./fetch-retry";

let browserClient: SupabaseClient | null = null;
let audienceClient: SupabaseClient | null = null;
let anonymousSignInPromise: ReturnType<SupabaseClient["auth"]["signInAnonymously"]> | null = null;

export const supabaseConfigured = Boolean(
  (process.env.NEXT_PUBLIC_DATA_MODE === "rest" || process.env.NEXT_PUBLIC_DATA_MODE === "supabase") &&
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
      {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
        global: { fetch: fetchWithAbortedTransactionRetry }
      }
    );
  }
  return browserClient;
}

/**
 * 청중 페이지는 강사 로그인과 별도의 Auth 저장소를 사용한다.
 * 같은 브라우저에서 발표자 화면과 청중 화면을 함께 열어도 청중 쓰기가
 * admin JWT로 전송되어 participant 전용 RLS에 막히지 않게 한다.
 */
export function getAudienceSupabaseClient() {
  if (!supabaseConfigured) return null;
  if (!audienceClient) {
    audienceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        auth: {
          storageKey: "pin-class-audience-auth-v1",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          flowType: "pkce"
        },
        global: { fetch: fetchWithAbortedTransactionRetry }
      }
    );
  }
  return audienceClient;
}

/** 현재 세션 사용자. 없다고 해서 익명 세션을 만들지는 않는다. */
export async function getSessionUser(): Promise<User | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.user ?? null;
}

/**
 * 큰 원본을 사용자 Storage 경로에 올리고 /api/convert 가 같은 소유자를 검증할 때 쓴다.
 * 강사 전용 경로이므로 익명 세션으로 대체하지 않는다.
 */
export async function getUploadSession() {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  if (!data.session || data.session.user.is_anonymous) return null;
  return { accessToken: data.session.access_token, userId: data.session.user.id };
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
  const data = await restRequest<{ id: string; role: Profile["role"]; email: string; display_name: string; avatar_url: string } | null>(client, "/me");
  if (!data || data.id !== userId) return null;
  return { id: data.id, role: data.role, email: data.email, displayName: data.display_name, avatarUrl: data.avatar_url };
}

/** 수강생(QR 참여) 전용 — 세션이 없으면 익명으로 만들어 준다. */
export async function ensureAnonymousUser() {
  const client = getAudienceSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  if (data.session?.user?.is_anonymous) return data.session.user;
  if (data.session?.user) await client.auth.signOut({ scope: "local" });
  if (!anonymousSignInPromise) anonymousSignInPromise = client.auth.signInAnonymously();
  try {
    const { data: signedIn, error } = await anonymousSignInPromise;
    if (error) throw error;
    return signedIn.user;
  } finally {
    anonymousSignInPromise = null;
  }
}
