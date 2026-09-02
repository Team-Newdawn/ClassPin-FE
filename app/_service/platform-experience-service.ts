import { ensureAnonymousUser, getAudienceSupabaseClient } from "@/app/_infrastructure/supabase/client";

export async function submitLectureExperienceResponse(
  code: string,
  experience: string,
  improvement: string
) {
  const client = getAudienceSupabaseClient();
  if (!client) throw new Error("Supabase 연결을 찾지 못했습니다.");
  if (!await ensureAnonymousUser()) throw new Error("참여 세션을 만들지 못했습니다.");
  const { error } = await client.rpc("submit_lecture_experience_response", {
    target_code: code,
    target_experience: experience,
    target_improvement: improvement
  });
  if (error) throw error;
}
