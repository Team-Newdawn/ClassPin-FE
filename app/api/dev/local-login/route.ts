import { getSupabaseServiceClient } from "@/app/_infrastructure/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOCAL_INSTRUCTOR_EMAIL = "local-instructor@classpin.test";

function isLoopbackHostname(hostname: string) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

function localLoginIsAllowed(request: Request) {
  if (process.env.NODE_ENV === "production") return false;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return false;

  try {
    return isLoopbackHostname(new URL(request.url).hostname)
      && isLoopbackHostname(new URL(supabaseUrl).hostname);
  } catch {
    return false;
  }
}

async function findLocalInstructorEmail() {
  const service = getSupabaseServiceClient();
  if (!service) return null;

  // 복제한 리포트가 있으면 그 소유자로 로그인해야 RLS를 통과해 바로 볼 수 있다.
  const { data: latestReport } = await service
    .from("ai_reports")
    .select("owner_id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestReport?.owner_id) {
    const { data } = await service.auth.admin.getUserById(latestReport.owner_id);
    if (data.user?.email) return data.user.email;
  }

  const { data: profile } = await service
    .from("profiles")
    .select("email")
    .eq("role", "admin")
    .not("email", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return profile?.email ?? LOCAL_INSTRUCTOR_EMAIL;
}

export async function POST(request: Request) {
  if (!localLoginIsAllowed(request)) {
    return Response.json({ error: "LOCAL_LOGIN_NOT_AVAILABLE" }, { status: 404 });
  }

  const service = getSupabaseServiceClient();
  if (!service) {
    return Response.json({ error: "LOCAL_SUPABASE_NOT_CONFIGURED" }, { status: 503 });
  }

  const email = await findLocalInstructorEmail();
  if (!email) {
    return Response.json({ error: "LOCAL_INSTRUCTOR_NOT_FOUND" }, { status: 503 });
  }

  const { data, error } = await service.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { data: { full_name: "로컬 강사" } },
  });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    return Response.json({ error: "LOCAL_LOGIN_TOKEN_FAILED" }, { status: 503 });
  }

  return Response.json(
    { tokenHash },
    { headers: { "Cache-Control": "no-store" } },
  );
}
