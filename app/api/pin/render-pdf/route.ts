import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { resolveDocumentBinary } from "@/lib/server/document-binaries";
import { getPdfPageCount, renderPdfPages } from "@/lib/server/pdf-render";
import { getSupabaseClientForToken } from "@/lib/supabase/server";
import type { CampaignPage } from "@/lib/pin/types";

export const runtime = "nodejs";

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_RENDERED_BYTES = 10 * 1024 * 1024;
const MAX_PDF_PAGES = 100;
const RENDER_TIMEOUT_MS = 240_000;
const UPLOAD_CONCURRENCY = 10;
const CAMPAIGN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const byPageNumber = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
const pageIndexOf = (name: string) => Number(/(\d+)\.jpg$/.exec(name)?.[1] ?? 0) - 1;

/** JPEG SOF 마커에서 이미지 크기를 읽는다. 별도 이미지 디코더 없이 Storage 메타데이터를 만든다. */
function jpegSize(buffer: Buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error("올바른 JPEG가 아닙니다.");
  let offset = 2;
  while (offset + 8 < buffer.length) {
    while (offset < buffer.length && buffer[offset] !== 0xff) offset += 1;
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset++];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    const isSof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (isSof && offset + 7 <= buffer.length) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    if (length < 2) break;
    offset += length;
  }
  throw new Error("JPEG 크기를 읽지 못했습니다.");
}

export async function POST(request: Request) {
  let work: string | null = null;
  try {
    // 렌더링 API가 공개 CPU·Storage 프록시가 되지 않도록 실제 로그인 사용자를 먼저 확인한다.
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    const client = token ? getSupabaseClientForToken(token) : null;
    if (!client) return NextResponse.json({ error: "로그인 정보가 필요합니다." }, { status: 401 });
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user || auth.user.is_anonymous) {
      return NextResponse.json({ error: "로그인 정보가 만료되었습니다. 새로고침 후 다시 시도해 주세요." }, { status: 401 });
    }

    const form = await request.formData();
    const file = form.get("file");
    const campaignId = form.get("campaignId");
    if (!(file instanceof File)) return NextResponse.json({ error: "PDF 파일이 필요합니다." }, { status: 400 });
    if (typeof campaignId !== "string" || !CAMPAIGN_ID_PATTERN.test(campaignId)) {
      return NextResponse.json({ error: "캠페인 식별자가 올바르지 않습니다." }, { status: 400 });
    }
    const isPdf = file.type === "application/pdf" || path.extname(file.name).toLowerCase() === ".pdf";
    if (!isPdf) return NextResponse.json({ error: "PDF 파일만 변환할 수 있습니다." }, { status: 415 });
    if (file.size > MAX_PDF_BYTES) return NextResponse.json({ error: "PDF는 10MB 이하만 올릴 수 있습니다." }, { status: 413 });

    work = await mkdtemp(path.join(tmpdir(), "pin-reference-"));
    const source = path.join(work, "source.pdf");
    const pagesDir = path.join(work, "pages");
    await mkdir(pagesDir, { recursive: true });
    await writeFile(source, Buffer.from(await file.arrayBuffer()));

    const pdftoppm = await resolveDocumentBinary("pdftoppm");
    const total = await getPdfPageCount(pdftoppm, source);
    if (!total) return NextResponse.json({ error: "PDF 페이지를 찾지 못했습니다." }, { status: 422 });
    if (total > MAX_PDF_PAGES) {
      return NextResponse.json({ error: `PDF는 최대 ${MAX_PDF_PAGES}페이지까지 올릴 수 있습니다.` }, { status: 422 });
    }

    await renderPdfPages({
      pdftoppm,
      pdf: source,
      outDir: pagesDir,
      total,
      maxEdge: 2400,
      quality: 88,
      maxWorkers: Math.min(8, Math.max(2, availableParallelism())),
      timeoutMs: RENDER_TIMEOUT_MS,
    });

    const files = (await readdir(pagesDir)).filter((name) => name.endsWith(".jpg")).sort(byPageNumber);
    if (files.length !== total) throw new Error(`렌더된 페이지 수가 다릅니다. expected=${total} actual=${files.length}`);

    const bucket = client.storage.from("campaign-images");
    const uploadedPaths: string[] = [];
    const pages: CampaignPage[] = [];
    try {
      for (let start = 0; start < files.length; start += UPLOAD_CONCURRENCY) {
        const batch = files.slice(start, start + UPLOAD_CONCURRENCY);
        const settled = await Promise.allSettled(batch.map(async (name) => {
          const image = await readFile(path.join(pagesDir, name));
          if (image.length > MAX_RENDERED_BYTES) throw new Error(`${name}이 10MB를 초과합니다.`);
          const pageIndex = pageIndexOf(name);
          const id = crypto.randomUUID();
          const imagePath = `${auth.user.id}/${campaignId}/${id}.jpg`;
          const { error } = await bucket.upload(imagePath, image, { contentType: "image/jpeg", upsert: false });
          if (error) throw error;
          uploadedPaths.push(imagePath);
          const size = jpegSize(image);
          return {
            id,
            campaignId,
            pageIndex,
            imagePath,
            imageUrl: bucket.getPublicUrl(imagePath).data.publicUrl,
            imageWidth: size.width,
            imageHeight: size.height,
            audienceGroups: [] as string[],
          } satisfies CampaignPage;
        }));
        pages.push(...settled.filter((result): result is PromiseFulfilledResult<CampaignPage> => result.status === "fulfilled").map((result) => result.value));
        const failed = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
        if (failed) throw failed.reason;
      }
      pages.sort((a, b) => a.pageIndex - b.pageIndex);
      return NextResponse.json({ pages });
    } catch (error) {
      if (uploadedPaths.length) await bucket.remove(uploadedPaths);
      throw error;
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Pin PDF reference rendering failed:", detail);
    return NextResponse.json({ error: "PDF 전체 페이지를 이미지로 변환하지 못했습니다." }, { status: 422 });
  } finally {
    if (work) await rm(work, { recursive: true, force: true });
  }
}
