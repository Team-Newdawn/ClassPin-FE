import type { SupabaseClient } from "@supabase/supabase-js";

export async function restRequest<T = void>(
  client: SupabaseClient,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  const session = data.session;
  if (!session?.access_token) throw new Error("REST request requires an authenticated session.");
  if ((path.startsWith("/instructor/") || path === "/convert") && session.user.is_anonymous) {
    throw new Error("REST request requires an instructor session.");
  }
  if (path.startsWith("/participant/") && !session.user.is_anonymous) {
    throw new Error("REST request requires a participant session.");
  }
  const response = await fetch(`/api/rest${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) {
    let detail = text;
    try {
      const payload = JSON.parse(text);
      if (typeof payload.error === "string") detail = payload.error;
    } catch { /* Non-JSON upstream errors still retain their HTTP status. */ }
    throw new Error(`REST ${response.status}: ${detail || response.statusText}`);
  }
  return text ? JSON.parse(text) as T : undefined as T;
}
