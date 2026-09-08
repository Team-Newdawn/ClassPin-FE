import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabaseServerConfigured = Boolean(
  process.env.NEXT_PUBLIC_DATA_MODE === "supabase" && url && publishableKey
);

/**
 * 요청을 보낸 사용자의 권한 그대로 동작하는 클라이언트.
 *
 * 서비스 키를 쓰면 RLS 를 통째로 우회하므로, 업로드 경로가 정말 그 사용자의
 * 폴더인지 storage 정책이 검증하도록 사용자 토큰을 그대로 전달한다.
 */
export function getSupabaseClientForToken(accessToken: string): SupabaseClient | null {
  if (!supabaseServerConfigured) return null;
  return createClient(url!, publishableKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

let serviceClient: SupabaseClient | null = null;

/** 서버 전용 privileged client. 브라우저 번들이나 NEXT_PUBLIC_*에 secret을 넣지 않는다. */
export function getSupabaseServiceClient(): SupabaseClient | null {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseServerConfigured || !secretKey) return null;
  if (!serviceClient) {
    serviceClient = createClient(url!, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return serviceClient;
}
