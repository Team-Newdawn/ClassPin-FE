import { getAccessToken } from "@/lib/supabase/client";
import type { CampaignPage } from "@/lib/pin/types";

export const PDF_MIME_TYPE = "application/pdf";

export function isPdfFile(file: File) {
  return file.type === PDF_MIME_TYPE || file.name.toLowerCase().endsWith(".pdf");
}

/** PDF 전체 페이지를 JPEG로 렌더링해 campaign-images 버킷에 올린다. */
export async function renderPdfPages(campaignId: string, file: File): Promise<CampaignPage[]> {
  const token = await getAccessToken();
  if (!token) throw new Error("관리자 로그인 정보가 필요합니다.");

  const form = new FormData();
  form.append("file", file);
  form.append("campaignId", campaignId);
  const response = await fetch("/api/pin/render-pdf", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!response.ok) {
    let message = "PDF 전체 페이지를 이미지로 변환하지 못했습니다.";
    try { message = (await response.json() as { error?: string }).error || message; } catch { /* Use the fallback. */ }
    throw new Error(message);
  }

  const body = await response.json() as { pages?: CampaignPage[] };
  if (!body.pages?.length) throw new Error("변환된 PDF 페이지가 없습니다.");
  return body.pages;
}
