import { getAccessToken } from "@/lib/supabase/client";
import type { Slide } from "@/lib/types";

/** 강의 자료를 슬라이드 이미지로 변환한다. 업로드 화면 두 곳이 함께 쓴다. */
export async function convertToSlides(file: File): Promise<Slide[]> {
  const form = new FormData();
  form.append("file", file);
  // 서버가 결과를 이 사용자의 Storage 폴더에 넣으려면 신원이 필요하다.
  const token = await getAccessToken();
  const response = await fetch("/api/convert", {
    method: "POST",
    body: form,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({ error: "슬라이드 변환에 실패했습니다." })) as { error?: string };
    throw new Error(failure.error || "슬라이드 변환에 실패했습니다.");
  }
  const data = await response.json() as { slides: Slide[] };
  return data.slides;
}
