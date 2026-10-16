import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { cachedFile } from "@/app/_infrastructure/pdf-cache";
import { getSupabaseClientForToken, supabaseServerConfigured } from "@/app/_infrastructure/supabase/server";

const SOURCE_BUCKET = "course-materials";
/** `{owner uuid}/{upload uuid}/source.pdf`. 업로드 경로 모양 그대로이며 그 밖의 경로는 받지 않는다. */
const SOURCE_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/source\.pdf$/;

/**
 * 원본 PDF 를 요청자 권한으로 읽어 내보낸다.
 *
 * 서비스 키를 쓰지 않고 요청자 토큰을 그대로 Storage 에 보내므로, 소유자이거나 live 강의의 참여자일 때만
 * 열리는 기존 RLS 정책이 매 요청마다 다시 적용된다. 강의를 끄면 다음 요청부터 거부된다.
 * 바이트는 서버 디스크 캐시에서 내보내므로 Storage 에서는 자료당 한 번만 나간다.
 */
export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const client = token && supabaseServerConfigured ? getSupabaseClientForToken(token) : null;
  if (!client) return Response.json({ error: "Authentication required" }, { status: 401 });
  const sourcePath = new URL(request.url).searchParams.get("path") ?? "";
  if (!SOURCE_PATH.test(sourcePath)) return Response.json({ error: "Invalid path" }, { status: 400 });

  const bucket = client.storage.from(SOURCE_BUCKET);
  const { data: allowed, error } = await bucket.exists(sourcePath);
  if (error || !allowed) return Response.json({ error: "Not available" }, { status: 403 });

  const file = await cachedFile(sourcePath, async () => {
    const { data, error: downloadError } = await bucket.download(sourcePath).asStream();
    if (downloadError || !data) throw downloadError ?? new Error("PDF download failed");
    return data;
  });
  const { size } = await stat(file);
  // PDF.js 는 Accept-Ranges 가 있어야 파일 끝의 xref 와 필요한 페이지만 먼저 받아 첫 화면을 그린다.
  // 없으면 전체를 받은 뒤에야 렌더한다. suffix range(`bytes=-n`)는 PDF.js 가 보내지 않으므로 전체 응답으로 둔다.
  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.get("range") ?? "");
  const start = range ? Number(range[1]) : 0;
  const end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (range && start > end) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  return new Response(Readable.toWeb(createReadStream(file, range ? { start, end } : undefined)) as ReadableStream, {
    status: range ? 206 : 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    },
  });
}
