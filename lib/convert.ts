import { getAccessToken } from "@/lib/supabase/client";
import type { Slide } from "@/lib/types";

export type ConvertCallbacks = {
  /** 업로드 진행률(0~1). 브라우저가 서버로 바이트를 올리는 동안 호출된다. */
  onUploadProgress?: (fraction: number) => void;
  /** 전체 페이지 수. 서버가 렌더링을 시작할 때 한 번 알려준다. */
  onMeta?: (total: number) => void;
  /** 슬라이드 한 장이 변환·업로드될 때마다 호출된다(도착 순, 페이지 순 아님). */
  onSlide?: (slide: Slide, total: number) => void;
};

type ConvertEvent =
  | { type: "meta"; total: number }
  | { type: "slide"; slide: Slide }
  | { type: "done" }
  | { type: "error"; error?: string };

/**
 * 강의 자료를 슬라이드 이미지로 변환한다. 업로드 화면 두 곳이 함께 쓴다.
 *
 * fetch 로는 업로드 진행률을 알 수 없어 XMLHttpRequest 를 쓴다. 인증된 경우 서버는
 * NDJSON 을 흘려보내므로(한 줄에 이벤트 하나) responseText 를 증분 파싱해 슬라이드가
 * 도착하는 대로 onSlide 로 넘긴다. 인증이 없으면(로컬 데모) 단일 JSON 을 받는다.
 */
export async function convertToSlides(file: File, callbacks?: ConvertCallbacks): Promise<Slide[]> {
  const form = new FormData();
  form.append("file", file);
  // 서버가 결과를 이 사용자의 Storage 폴더에 넣으려면 신원이 필요하다. 토큰이 있으면
  // 서버가 스트리밍으로 응답한다.
  const token = await getAccessToken();
  const streaming = Boolean(token);

  return new Promise<Slide[]>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/convert");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    const slides: Slide[] = [];
    let total = 0;
    let consumed = 0;
    let streamError: string | null = null;
    let done = false;

    // 완성된 줄만 파싱하고, 잘린 마지막 줄은 다음 progress 까지 남겨둔다.
    const pump = () => {
      const text = xhr.responseText;
      let newline: number;
      while ((newline = text.indexOf("\n", consumed)) !== -1) {
        const line = text.slice(consumed, newline).trim();
        consumed = newline + 1;
        if (!line) continue;
        let event: ConvertEvent;
        try { event = JSON.parse(line) as ConvertEvent; } catch { continue; }
        if (event.type === "meta") { total = event.total || 0; callbacks?.onMeta?.(total); }
        else if (event.type === "slide") { slides.push(event.slide); callbacks?.onSlide?.(event.slide, total); }
        else if (event.type === "done") { done = true; }
        else if (event.type === "error") { streamError = event.error || "슬라이드 변환에 실패했습니다."; }
      }
    };

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) callbacks?.onUploadProgress?.(event.loaded / event.total);
    };
    if (streaming) xhr.onprogress = () => { if (xhr.status === 200) pump(); };

    xhr.onload = () => {
      if (streaming && xhr.status === 200) {
        pump();
        if (streamError) return reject(new Error(streamError));
        if (!done) return reject(new Error("변환이 도중에 끊겼어요. 다시 시도해 주세요."));
        resolve(slides.sort((a, b) => a.pageIndex - b.pageIndex));
        return;
      }
      if (!streaming && xhr.status >= 200 && xhr.status < 300) {
        try { return resolve((JSON.parse(xhr.responseText) as { slides: Slide[] }).slides); }
        catch { return reject(new Error("서버 응답을 해석하지 못했습니다.")); }
      }
      let message = "슬라이드 변환에 실패했습니다.";
      try { message = (JSON.parse(xhr.responseText) as { error?: string }).error || message; } catch { /* 본문이 JSON 이 아니면 기본 메시지 */ }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("네트워크 오류로 업로드에 실패했습니다."));
    xhr.send(form);
  });
}
