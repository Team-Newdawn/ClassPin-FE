import { createReadStream } from "node:fs";
import { rm, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { cachedFile, findCachedFile } from "@/app/_infrastructure/pdf-cache";
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

  // 메타데이터도 호출자의 JWT/RLS로 읽는다. 바이트 캐시가 있어도 생략하지 않는다.
  const { data: info, error } = await client.storage.from(SOURCE_BUCKET).info(sourcePath);
  if (error || !info) return Response.json({ error: "Not available" }, { status: 403 });
  const size = info.size;
  if (!Number.isSafeInteger(size) || !size || size < 0) {
    return Response.json({ error: "Invalid PDF size" }, { status: 502 });
  }

  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.get("range") ?? "");
  const start = range ? Number(range[1]) : 0;
  const end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (range && (!Number.isSafeInteger(start) || start > end)) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  const download = async (rangeHeader?: string) => {
    const source = rangeHeader ? getSupabaseClientForToken(token!, rangeHeader)! : client;
    const { data, error: downloadError } = await source.storage.from(SOURCE_BUCKET).download(sourcePath).asStream();
    if (downloadError || !data) throw downloadError ?? new Error("PDF download failed");
    return data;
  };

  const cached = await findCachedFile(sourcePath);
  let stream: Readable;
  if (range && !cached) {
    // 임의 Range마다 파일을 만들지 않고 고정 블록을 공유한다. 전체 원본을 기다리지 않는다.
    stream = Readable.from((async function* () {
      const blockSize = 512 * 1024;
      for (let offset = Math.floor(start / blockSize) * blockSize; offset <= end; offset += blockSize) {
        const blockEnd = Math.min(offset + blockSize - 1, size - 1);
        const part = await cachedFile(`${sourcePath}#${offset}-${blockEnd}`, () => download(`bytes=${offset}-${blockEnd}`));
        if ((await stat(part)).size !== blockEnd - offset + 1) {
          await rm(part, { force: true });
          throw new Error("Invalid PDF range response");
        }
        yield* createReadStream(part, { start: Math.max(0, start - offset), end: Math.min(end, blockEnd) - offset });
      }
    })());
  } else {
    // Next는 첫 청크에서 헤더를 flush한다. 빈 청크로 Range 탐색을 먼저 시작한다.
    stream = Readable.from((async function* () {
      yield new Uint8Array(0);
      const file = cached ?? await cachedFile(sourcePath, () => download());
      yield* createReadStream(file, range ? { start, end } : undefined);
    })());
  }
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: range ? 206 : 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(end - start + 1),
      // 작은 파일은 전체 응답 한 번으로 끝내고, 큰 파일은 PDF.js 기본 Range를 사용한다.
      "Accept-Ranges": !range && size <= 256 * 1024 ? "none" : "bytes",
      "Cache-Control": "no-store",
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    },
  });
}
