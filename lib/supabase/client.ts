import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
      { auth: { persistSession: true, autoRefreshToken: true } }
    );
  }
  return browserClient;
}

/** /api/convert 가 업로드를 사용자 폴더에 넣으려면 누가 보냈는지 알아야 한다. */
export async function getAccessToken() {
  const client = getSupabaseClient();
  if (!client) return null;
  await ensureAnonymousUser();
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

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
