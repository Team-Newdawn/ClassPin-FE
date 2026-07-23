import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { getSupabaseClientForToken } from "@/lib/supabase/server";
import type { Slide } from "@/lib/types";

export const runtime = "nodejs";
const run = promisify(execFile);

async function resolveBinary(name: "pdftoppm" | "soffice") {
  const envName = name === "pdftoppm" ? "PDFTOPPM_PATH" : "SOFFICE_PATH";
  const pathCandidates = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean).map((directory) => path.join(/* turbopackIgnore: true */ directory, name));
  const candidates = [
    process.env[envName],
    ...pathCandidates,
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    path.join(/* turbopackIgnore: true */ homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override", name),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      await run(candidate, ["-v"], { timeout: 5000 });
      return candidate;
    } catch { /* Try the next known runtime location. */ }
  }
  throw new Error(`${name} 실행 파일을 찾을 수 없습니다.`);
}

export async function POST(request: Request) {
  let work: string | null = null;
  let localDir: string | null = null;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "파일이 필요합니다." }, { status: 400 });
    if (file.size > 40 * 1024 * 1024) return NextResponse.json({ error: "파일이 40MB를 초과합니다. 더 작은 파일로 다시 시도해 주세요." }, { status: 413 });

    const extension = path.extname(file.name).toLowerCase();
    if (![".pdf", ".ppt", ".pptx"].includes(extension)) return NextResponse.json({ error: "PDF 또는 PPT 파일만 지원합니다." }, { status: 415 });

    work = await mkdtemp(path.join(tmpdir(), "pin-class-"));
    const source = path.join(work, `source${extension}`);
    await writeFile(source, Buffer.from(await file.arrayBuffer()));
    let pdf = source;
    if (extension !== ".pdf") {
      const soffice = await resolveBinary("soffice");
      await run(soffice, ["--headless", "--convert-to", "pdf", "--outdir", work, source], { timeout: 60000 });
      pdf = path.join(work, "source.pdf");
    }

    const pages = path.join(work, "pages");
    await mkdir(pages, { recursive: true });
    const pdftoppm = await resolveBinary("pdftoppm");
    await run(pdftoppm, ["-jpeg", "-r", "120", "-jpegopt", "quality=86", pdf, path.join(pages, "slide")], { timeout: 60000 });
    const images = (await readdir(pages)).filter((name) => name.endsWith(".jpg")).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (!images.length) throw new Error("PDF에서 슬라이드를 생성하지 못했습니다.");

    // 컨테이너 디스크는 인스턴스가 죽으면 같이 사라지고 인스턴스끼리 공유되지도
    // 않는다. 변환한 자리에서 바로 Storage 에 올려야 재접속·재배포 후에도 남는다.
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    const client = token ? getSupabaseClientForToken(token) : null;
    if (client) {
      const { data: auth, error: authError } = await client.auth.getUser();
      if (authError || !auth.user) return NextResponse.json({ error: "로그인 정보가 만료되었습니다. 새로고침 후 다시 시도해 주세요." }, { status: 401 });

      const uploadId = crypto.randomUUID();
      const bucket = client.storage.from("lecture-slides");
      const slides: Slide[] = [];
      for (const [index, name] of images.entries()) {
        const id = crypto.randomUUID();
        // storage 정책이 첫 폴더명을 소유자로 검증한다. 경로 모양을 바꾸면 업로드가 막힌다.
        const imagePath = `${auth.user.id}/${uploadId}/${id}.jpg`;
        const { error: uploadError } = await bucket.upload(imagePath, await readFile(path.join(pages, name)), { contentType: "image/jpeg", upsert: false });
        if (uploadError) throw uploadError;
        slides.push({ id, pageIndex: index, title: `Slide ${index + 1}`, imagePath, imageUrl: bucket.getPublicUrl(imagePath).data.publicUrl });
      }
      return NextResponse.json({ slides });
    }

    // Supabase 를 설정하지 않은 로컬 데모 전용 경로. 배포 환경에서는 쓰이지 않는다.
    const outputId = crypto.randomUUID();
    localDir = path.join(/* turbopackIgnore: true */ process.cwd(), "public", "generated", outputId);
    await mkdir(localDir, { recursive: true });
    const slides: Slide[] = [];
    for (const [index, name] of images.entries()) {
      await copyFile(path.join(pages, name), path.join(localDir, name));
      slides.push({ id: crypto.randomUUID(), pageIndex: index, title: `Slide ${index + 1}`, imageUrl: `/generated/${outputId}/${name}` });
    }
    return NextResponse.json({ slides });
  } catch (error) {
    if (localDir) await rm(localDir, { recursive: true, force: true });
    const message = error instanceof Error ? error.message : "슬라이드 변환에 실패했습니다.";
    console.error("Slide conversion failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (work) await rm(work, { recursive: true, force: true });
  }
}
