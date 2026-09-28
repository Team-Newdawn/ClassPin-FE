import type { Session } from "@supabase/supabase-js";
import {
  fetchOwnProfile,
  getSupabaseClient,
  signInWithGoogle,
  signOutUser,
  supabaseConfigured
} from "@/app/_infrastructure/supabase/client";

export const authConfigured = supabaseConfigured;
export { fetchOwnProfile, signInWithGoogle, signOutUser };

export function observeAuthSession(onSession: (session: Session | null) => void): (() => void) | null {
  const client = getSupabaseClient();
  if (!client) return null;
  let active = true;
  const emit = (session: Session | null) => {
    if (active) onSession(session);
  };
  void client.auth.getSession().then(({ data }) => emit(data.session));
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    // Auth 콜백 내부에서 다시 Supabase를 호출하면 락이 겹칠 수 있어 다음 틱에 알린다.
    setTimeout(() => { if (active) onSession(session); }, 0);
  });
  return () => {
    active = false;
    data.subscription.unsubscribe();
  };
}
