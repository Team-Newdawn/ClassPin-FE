import { writeFileSync } from "node:fs";
import { readOwnedInsightSource } from "/Users/minchanpark/Documents/orca/workspaces/ClassPin-FE/feature-dev-ai/app/_service/insight-request.ts";
const src = await readOwnedInsightSource(`Bearer ${process.argv[2]}`, ["5fe876f8-d988-4caf-95a5-193ca3903eee"], AbortSignal.timeout(30000));
const m = src.materials[0];
const out = { sourcePath: m.sourcePath, slides: m.slides.map((s) => ({ page: s.pageIndex + 1, pdfPage: s.sourcePageIndex })),
  questions: m.questions.map((q) => ({ id: q.id, page: m.slides.find((s) => s.id === q.slideId)!.pageIndex + 1, text: q.text, anchor: q.anchor })) };
writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
console.log(out.sourcePath.slice(-30), out.questions.map((q) => `${q.page}:${q.anchor?.kind}`).join(" "));
