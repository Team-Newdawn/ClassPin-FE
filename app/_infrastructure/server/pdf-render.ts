import "server-only";

import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export async function getPdfPageCount(pdftoppm: string, pdf: string) {
  try {
    const pdfinfo = path.join(/* turbopackIgnore: true */ path.dirname(pdftoppm), "pdfinfo");
    const { stdout } = await run(pdfinfo, [pdf], { timeout: 30_000 });
    return Number(/^Pages:\s+(\d+)/m.exec(stdout)?.[1] ?? 0);
  } catch { return 0; }
}

export function renderPdfPages(input: {
  pdftoppm: string;
  pdf: string;
  outDir: string;
  total: number;
  maxEdge: number;
  quality: number;
  maxWorkers: number;
  timeoutMs: number;
}) {
  const args = ["-jpeg", "-scale-to", String(input.maxEdge), "-jpegopt", `quality=${input.quality}`];
  const prefix = path.join(input.outDir, "page");
  const workers = Math.min(input.maxWorkers, Math.ceil(input.total / 2));
  if (!input.total || workers <= 1) {
    return run(input.pdftoppm, [...args, input.pdf, prefix], { timeout: input.timeoutMs }).then(() => undefined);
  }

  const size = Math.ceil(input.total / workers);
  const ranges: Array<[number, number]> = [];
  for (let start = 1; start <= input.total; start += size) {
    ranges.push([start, Math.min(start + size - 1, input.total)]);
  }
  return Promise.all(ranges.map(([first, last]) =>
    run(input.pdftoppm, [...args, "-f", String(first), "-l", String(last), input.pdf, prefix], { timeout: input.timeoutMs })
  )).then(() => undefined);
}
