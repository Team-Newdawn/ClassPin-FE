import Anthropic from "/Users/minchanpark/Documents/orca/workspaces/ClassPin-FE/feature-dev-ai/node_modules/@anthropic-ai/sdk/index.mjs";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY, maxRetries: 4 });
const pins = JSON.parse(readFileSync("pins-hard.json", "utf8"));
const schema = { type: "object", properties: { results: { type: "array", items: { type: "object", properties: { n: { type: "integer" }, reason: { type: "string" }, ok: { type: "boolean" } }, required: ["n", "reason", "ok"], additionalProperties: false } } }, required: ["results"], additionalProperties: false };
const grade = async (items: { n: number; truth: string; answer: string }[]) => {
  const m = await client.messages.create({ model: "claude-sonnet-5-5", max_tokens: 6000, output_config: { effort: "low", format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: `각 PIN의 답이 정답과 같은 슬라이드 요소를 가리키는지 채점하라. 표의 칸은 행과 열(회사)이 모두 맞아야 정답이다(기호 설명은 틀려도 행·열이 맞으면 정답). 두 칸·두 요소 사이라고 얼버무리면 오답. 차트·문구는 같은 요소를 가리키면 정답이고, 옆의 다른 요소면 오답이다. PIN마다 reason에 한 줄 근거를 먼저 쓰고 ok를 정한다.\n\n` +
      items.map((i) => `PIN ${i.n}\n정답: ${i.truth}\n답: ${i.answer}`).join("\n\n") }] });
  return JSON.parse((m.content.find((b) => b.type === "text") as any).text).results as { n: number; reason: string; ok: boolean }[];
};
const files = readdirSync(".").filter((f) => f.startsWith("results-hard-"));
const tasks: (() => Promise<void>)[] = [];
for (const f of files) {
  const rs = JSON.parse(readFileSync(f, "utf8"));
  for (const r of rs.filter((r: any) => !r.error)) {
    const items = pins[r.page].map((p: any) => ({ n: p.n, truth: p.label, answer: r.answers.find((a: any) => a.n === p.n)?.target ?? "(없음)" }));
    r.graded2 = [];
    for (let i = 0; i < items.length; i += 25) tasks.push(async () => { const out = await grade(items.slice(i, i + 25));
      for (const it of items.slice(i, i + 25)) { const g = out.find((o) => o.n === it.n); r.graded2.push({ ...it, ok: g?.ok ?? false, reason: g?.reason ?? "missing" }); } });
  }
  tasks.push(async () => {});
  (globalThis as any)[f] = rs;
}
let next = 0; await Promise.all(Array.from({ length: 8 }, async () => { while (next < tasks.length) await tasks[next++](); }));
for (const f of files) { const rs = (globalThis as any)[f]; for (const r of rs.filter((r: any) => !r.error)) r.correct2 = r.graded2.filter((g: any) => g.ok).length; writeFileSync(f, JSON.stringify(rs, null, 1)); }
const all = files.flatMap((f) => (globalThis as any)[f]).filter((r: any) => !r.error);
let agree = 0, total = 0; for (const r of all) for (const g of r.graded2) { const o = r.graded.find((x: any) => x.n === g.n); total++; if (o?.ok === g.ok) agree++; }
console.log("agreement with first judge", (agree / total * 100).toFixed(1) + "%", total);
const by: Record<string, any[]> = {}; for (const r of all) (by[`${r.m} p${r.page}`] ??= []).push(r);
for (const [k, rs] of Object.entries(by).sort()) { const c = rs.map((r) => r.correct2 / r.total * 100); console.log(k, "n", rs.length, "mean", (c.reduce((a, b) => a + b) / c.length).toFixed(1) + "%", "min", Math.min(...c).toFixed(0) + "%", rs.map((r) => r.correct2).join(",")); }
