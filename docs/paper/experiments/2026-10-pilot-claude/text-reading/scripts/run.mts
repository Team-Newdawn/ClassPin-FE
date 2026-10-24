import Anthropic from "/Users/minchanpark/Documents/orca/workspaces/ClassPin-FE/feature-dev-ai/node_modules/@anthropic-ai/sdk/index.mjs";
import { PDFDocument } from "/Users/minchanpark/Documents/orca/workspaces/ClassPin-FE/feature-dev-ai/node_modules/pdf-lib/cjs/index.js";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY, maxRetries: 4 });
type Q = { id: string; q: string; a: string };
const synth = JSON.parse(readFileSync("synth-q.json", "utf8"));
const sets = [1, 2, 3, 4].map((page) => ({ name: `synth-p${page}`, pdf: "synth.pdf", page, png: `y-${page}.png`, qs: synth.filter((q: any) => q.page === page) as Q[] }));
sets.push({ name: "soi-p2", pdf: "../exp/deck.pdf", page: 2, png: "soi-02.png", qs: [
  { id: "S1", q: "왼쪽 카드 아래 각주 문장 전체", a: "*Data Insights Market: 2025-2033 Strategic Insights." },
  { id: "S2", q: "가운데 카드 아래 각주 문장 전체", a: "*Mordor Intelligence, Growth Trends & Forecasts 2025-2030" },
  { id: "S3", q: "오른쪽 카드 아래 각주 문장 전체", a: "*Amra & Elma LLC, Top 20 Communication Platform Marketing Statistics 2025" },
  { id: "S4", q: "파이 차트 카드 오른쪽 아래 작은 회색 주석", a: "*전체 SNS 시장" },
  { id: "S5", q: "파이 차트 범례의 두 번째 항목 이름", a: "오픈형 SNS 및 기타" }] });
sets.push({ name: "soi-p12", pdf: "../exp/deck.pdf", page: 12, png: "soi-12.png", qs: [
  { id: "S6", q: "'400+' 아래 작은 회색 설명", a: "현장 사용자 접점 확보" }, { id: "S7", q: "'5회' 아래 작은 회색 설명", a: "총 80명 진행" },
  { id: "S8", q: "'10명' 아래 작은 회색 설명", a: "2주간 진행" }, { id: "S9", q: "'+60 명' 아래 작은 회색 설명", a: "베타 앱 기반 테스트" },
  { id: "S10", q: "'영어, 스페인어' 아래 작은 회색 설명", a: "EN, ES" }] } as any);
const decks = new Map<string, any>();
const pagePdf = async (file: string, page: number) => { if (!decks.has(file)) decks.set(file, await PDFDocument.load(readFileSync(file)));
  const p = await PDFDocument.create(); p.addPage((await p.copyPages(decks.get(file), [page - 1]))[0]); return Buffer.from(await p.save()).toString("base64"); };
const pageText = (file: string, page: number) => execFileSync("pdftotext", ["-f", String(page), "-l", String(page), "-layout", file, "-"]).toString().replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
// Text layer is trusted only when almost every visible char is Hangul, Latin, digit, or common punctuation.
const readable = (t: string) => { const chars = [...t.replace(/\s/g, "")]; const ok = chars.filter((c) => /[가-힣ㄱ-ㅎA-Za-z0-9.,:;!?%()\[\]{}'"“”‘’\-+*/&@#=~·…_<>|]/.test(c)).length; return chars.length ? ok / chars.length : 0; };
const schema = { type: "object", properties: { answers: { type: "array", items: { type: "object", properties: { id: { type: "string" }, answer: { type: "string" } }, required: ["id", "answer"], additionalProperties: false } } }, required: ["answers"], additionalProperties: false };
const img = (f: string) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/png" as const, data: readFileSync(f).toString("base64") } });
async function run(method: string, set: typeof sets[number]) {
  const ask = { type: "text" as const, text: `슬라이드에 적힌 글자를 보이는 그대로 옮겨 적어라. 숫자·기호·띄어쓰기를 바꾸지 말고, 설명 없이 해당 글자만 answer에 쓴다.\n\n${set.qs.map((q) => `${q.id}: ${q.q}`).join("\n")}` };
  const text = pageText(set.pdf, set.page), score = readable(text);
  let content: Anthropic.ContentBlockParam[];
  if (method === "PDF") content = [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: await pagePdf(set.pdf, set.page) } }, ask];
  else if (method === "IMG") content = [img(set.png), ask];
  else if (method === "IMG+TXT" && score < 0.9) content = [img(set.png), ask];
  else content = [img(set.png), { type: "text", text: `이 슬라이드에서 추출한 글자(배치는 대략적):\n<slide_text>\n${text}\n</slide_text>` }, ask];
  const m = await client.messages.stream({ model: "claude-haiku-5-5", max_tokens: 8000, output_config: { effort: "low", format: { type: "json_schema", schema } }, messages: [{ role: "user", content }] }).finalMessage();
  const answers = JSON.parse((m.content.find((b) => b.type === "text") as any).text).answers as { id: string; answer: string }[];
  const norm = (s: string) => s.replace(/\s+/g, "").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  const graded = set.qs.map((q) => { const got = answers.find((a) => a.id === q.id)?.answer ?? ""; return { id: q.id, want: q.a, got, ok: norm(got) === norm(q.a) }; });
  return { graded, input: m.usage.input_tokens, output: m.usage.output_tokens, textUsed: method === "IMG+TXT-raw" || (method === "IMG+TXT" && score >= 0.9), readable: score };
}
const methods = ["PDF", "IMG", "IMG+TXT", "IMG+TXT-raw"], REPEATS = 3;
const jobs = methods.flatMap((m) => sets.filter((s) => m !== "IMG+TXT-raw" || s.name.startsWith("soi")).flatMap((s) => Array.from({ length: REPEATS }, (_, r) => ({ m, s, r }))));
const results: any[] = []; let next = 0;
await Promise.all(Array.from({ length: 6 }, async () => { while (next < jobs.length) { const j = jobs[next++];
  try { const res = await run(j.m, j.s); results.push({ m: j.m, set: j.s.name, r: j.r, ...res }); console.log(j.m, j.s.name, j.r, `${res.graded.filter((g) => g.ok).length}/${res.graded.length}`, `in ${res.input} out ${res.output} text ${res.textUsed} readable ${res.readable.toFixed(2)}`); }
  catch (e) { console.log("ERR", j.m, j.s.name, String(e).slice(0, 160)); } } }));
writeFileSync(`results-${Date.now()}.json`, JSON.stringify(results, null, 1));
