import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

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
  let publicDir: string | null = null;
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

    const outputId = crypto.randomUUID();
    publicDir = path.join(/* turbopackIgnore: true */ process.cwd(), "public", "generated", outputId);
    await mkdir(publicDir, { recursive: true });
    const pdftoppm = await resolveBinary("pdftoppm");
    await run(pdftoppm, ["-jpeg", "-r", "120", "-jpegopt", "quality=86", pdf, path.join(publicDir, "slide")], { timeout: 60000 });
    const images = (await readdir(publicDir)).filter((name) => name.endsWith(".jpg")).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (!images.length) throw new Error("PDF에서 슬라이드를 생성하지 못했습니다.");
    const slides = images.map((name, index) => ({ id: crypto.randomUUID(), pageIndex: index, title: `Slide ${index + 1}`, imageUrl: `/generated/${outputId}/${name}` }));
    return NextResponse.json({ slides });
  } catch (error) {
    if (publicDir) await rm(publicDir, { recursive: true, force: true });
    const message = error instanceof Error ? error.message : "슬라이드 변환에 실패했습니다.";
    console.error("Slide conversion failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (work) await rm(work, { recursive: true, force: true });
  }
}
