import Anthropic from "/Users/minchanpark/Documents/orca/workspaces/ClassPin-FE/feature-dev-ai/node_modules/@anthropic-ai/sdk/index.mjs";
import { PDFDocument } from "/Users/minchanpark/Documents/orca/workspaces/ClassPin-FE/feature-dev-ai/node_modules/pdf-lib/cjs/index.js";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const D = process.cwd(), client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY, maxRetries: 4 });
const pins: Record<string, { n: number; x: number; y: number; label: string; text: string }[]> = JSON.parse(readFileSync(`${D}/${process.env.PINS ?? "pins.json"}`, "utf8"));
const W = 1456, H = 819, REPEATS = Number(process.env.REPEATS ?? 3);
const deck = await PDFDocument.load(readFileSync(`${D}/deck.pdf`));
const pagePdf = async (page: number) => { const p = await PDFDocument.create(); p.addPage((await p.copyPages(deck, [page - 1]))[0]); return Buffer.from(await p.save()).toString("base64"); };
const png = (f: string) => readFileSync(`${D}/${f}`).toString("base64");
const img = (data: string) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/png" as const, data } });
const ask = "슬라이드 위 청중 PIN이 각각 슬라이드의 어떤 요소를 가리키는지 판단하라. 질문 본문은 모호하므로 위치로 판단한다. PIN 번호 순서대로 하나씩, target에 가리킨 요소를 구체적으로 쓴다: 표의 칸이면 행 이름·열 이름(회사)·표시 기호, 차트면 어떤 수치·막대·라벨인지.";
const schema = { type: "object", properties: { pins: { type: "array", items: { type: "object", properties: { n: { type: "integer" }, target: { type: "string" } }, required: ["n", "target"], additionalProperties: false } } }, required: ["pins"], additionalProperties: false };
const ZOOM: Anthropic.Tool = { name: "zoom", description: "이미지의 직사각형 영역을 원본 고해상도에서 잘라 확대해 본다. 좌표는 1456x819 이미지 기준 픽셀(원점 왼쪽 위).",
  input_schema: { type: "object", properties: { x1: { type: "integer" }, y1: { type: "integer" }, x2: { type: "integer" }, y2: { type: "integer" } }, required: ["x1", "y1", "x2", "y2"] } };
const zoom = (page: number, input: any) => {
  const x1 = Math.max(0, Math.min(W - 1, input.x1)), y1 = Math.max(0, Math.min(H - 1, input.y1)), x2 = Math.max(x1 + 1, Math.min(W, input.x2)), y2 = Math.max(y1 + 1, Math.min(H, input.y2));
  const w = (x2 - x1) * 2, h = (y2 - y1) * 2; let s = Math.min(1568 / Math.max(w, h), 4);
  while (Math.ceil(w * s / 28) * Math.ceil(h * s / 28) > 1568) s *= 0.97;
  const out = execFileSync("magick", [`${D}/hi${page}-${String(page).padStart(2, "0")}.png`, "-crop", `${w}x${h}+${x1 * 2}+${y1 * 2}`, "+repage", "-resize", `${Math.round(w * s)}x${Math.round(h * s)}`, "png:-"]);
  return [{ type: "text" as const, text: `확대: (${x1},${y1})-(${x2},${y2}) 영역` }, img(out.toString("base64"))];
};
async function run(method: string, page: number) {
  const list = pins[page];
  const pct = list.map((p) => `PIN ${p.n}: 왼쪽에서 ${Math.round(p.x / W * 100)}%, 위에서 ${Math.round(p.y / H * 100)}%: ${p.text}`).join("\n");
  const px = list.map((p) => `PIN ${p.n}: (${p.x}, ${p.y})px: ${p.text}`).join("\n");
  const pxNote = `이미지 크기는 ${W}x${H}px이고 원점은 왼쪽 위다.`;
  let content: Anthropic.ContentBlockParam[];
  if (method === "A") content = [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: await pagePdf(page) } }, { type: "text", text: `${ask}\n\n${pct}` }];
  else if (method === "B") content = [img(png(`s${page}-${String(page).padStart(2, "0")}.png`)), { type: "text", text: `${pxNote} ${ask}\n\n${px}` }];
  else content = [{ type: "text", text: "이미지 1: 원본 슬라이드" }, img(png(`s${page}-${String(page).padStart(2, "0")}.png`)), { type: "text", text: method === "E" ? "이미지 2: 같은 슬라이드에 PIN 위치를 빨간 점으로 표시(번호는 아래 좌표로 구분)" : "이미지 2: 같은 슬라이드에 PIN 위치를 빨간 점과 번호로 표시" }, img(png(process.env.PINS ? `hard-${method === "E" ? "dot" : "num"}${page}.png` : `mark${page}.png`)),
    { type: "text", text: `${pxNote} ${ask} 이미지 2의 표시는 위치 확인용이고 내용은 이미지 1에서 읽는다.${method === "D" ? " 점이 몰려 있거나 작은 글자라 확실하지 않으면 zoom으로 확대해 확인한다." : ""}\n\n${px}` }];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content }];
  let input = 0, output = 0, zooms = 0;
  for (let round = 0; ; round++) {
    const final = await client.messages.stream({ model: "claude-haiku-5-5", max_tokens: 16000, output_config: { effort: "low", format: { type: "json_schema", schema } },
      ...(method === "D" ? { tools: [ZOOM], tool_choice: { type: round < 4 ? "auto" : "none" } } : {}), messages }).finalMessage();
    input += final.usage.input_tokens + (final.usage.cache_read_input_tokens ?? 0) + (final.usage.cache_creation_input_tokens ?? 0); output += final.usage.output_tokens;
    if (final.stop_reason === "tool_use") {
      const uses = final.content.filter((b) => b.type === "tool_use"); zooms += uses.length;
      messages.push({ role: "assistant", content: final.content }, { role: "user", content: uses.map((b: any) => ({ type: "tool_result" as const, tool_use_id: b.id, content: zoom(page, b.input) })) });
      continue;
    }
    const text = final.content.filter((b) => b.type === "text").map((b: any) => b.text).join("");
    return { answers: (JSON.parse(text).pins as { n: number; target: string }[]), input, output, zooms };
  }
}
const judgeSchema = { type: "object", properties: { results: { type: "array", items: { type: "object", properties: { n: { type: "integer" }, ok: { type: "boolean" } }, required: ["n", "ok"], additionalProperties: false } } }, required: ["results"], additionalProperties: false };
async function judge(page: number, answers: { n: number; target: string }[]) {
  const truth = new Map(pins[page].map((p) => [p.n, p.label]));
  const rows = pins[page].map((p) => `PIN ${p.n}\n정답: ${p.label}\n답: ${answers.find((a) => a.n === p.n)?.target ?? "(없음)"}`).join("\n\n");
  const final = await client.messages.create({ model: "claude-sonnet-5-5", max_tokens: 8000, output_config: { effort: "medium", format: { type: "json_schema", schema: judgeSchema } },
    messages: [{ role: "user", content: `각 PIN의 답이 정답과 같은 슬라이드 요소를 가리키는지 채점하라. 표의 칸은 행과 열(회사)이 모두 맞아야 정답이다(기호 설명은 틀려도 행·열이 맞으면 정답). 차트·문구는 같은 요소를 가리키면 정답이고, 옆의 다른 요소면 오답이다.\n\n${rows}` }] });
  const parsed = JSON.parse((final.content.find((b) => b.type === "text") as any).text).results as { n: number; ok: boolean }[];
  return pins[page].map((p) => ({ n: p.n, ok: parsed.find((r) => r.n === p.n)?.ok ?? false, truth: truth.get(p.n), answer: answers.find((a) => a.n === p.n)?.target ?? "" }));
}

import { readdirSync } from "node:fs";
for (const f of readdirSync(D).filter((f) => f.startsWith("results-hard-"))) {
  const rs = JSON.parse(readFileSync(`${D}/${f}`, "utf8"));
  for (const r of rs) if (!r.error && r.correct / r.total < 0.5) {
    const graded = await judge(r.page, r.answers); r.graded = graded; r.correct = graded.filter((g: any) => g.ok).length; r.rejudged = true;
    console.log("rejudged", f, r.m, r.page, r.r, `${r.correct}/${r.total}`);
  }
  writeFileSync(`${D}/${f}`, JSON.stringify(rs, null, 1));
}
