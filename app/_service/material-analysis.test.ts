import assert from "node:assert/strict";
import { register } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type { AnalysisRow } from "./material-analysis.ts";

// The module reaches server-only binaries through insight-request; map `server-only` for plain Node, as the other server tests do.
const serverOnly = pathToFileURL(join(process.cwd(), "node_modules/next/dist/compiled/server-only/empty.js")).href;
register("data:text/javascript," + encodeURIComponent(`export function resolve(specifier, context, next) { return next(specifier === "server-only" ? ${JSON.stringify(serverOnly)} : specifier === "next/server" ? "next/server.js" : specifier, context); }`), import.meta.url);
const { analysisFingerprint, analysisView, ensureAnalysis, nextStep } = await import("./material-analysis.ts");

const ai = { name: "claude", model: () => "claude-haiku-5-5" };
const material = { versionId: "v1", slides: [{ id: "s1" }, { id: "s2" }],
  questions: [{ id: "q1", slideId: "s1", text: "출처는?", anchor: { kind: "point", x: 0.5, y: 0.5 }, answers: [{ body: "보고서" }], reactions: 0, status: "unanswered" }] } as unknown as Parameters<typeof analysisFingerprint>[0];

test("RPT-124: the fingerprint follows the prompt inputs, not empathy counts or answer status", () => {
  const base = analysisFingerprint(material, "폴더", ai);
  assert.equal(base, analysisFingerprint(structuredClone(material), "폴더", ai));
  const q = material.questions[0];
  assert.equal(analysisFingerprint({ ...material, questions: [{ ...q, reactions: 9, status: "answered" }] }, "폴더", ai), base);
  for (const changed of [
    analysisFingerprint({ ...material, questions: [{ ...q, text: "근거는?" }] }, "폴더", ai),
    analysisFingerprint({ ...material, questions: [{ ...q, anchor: { kind: "point", x: 0.1, y: 0.5 } }] }, "폴더", ai),
    analysisFingerprint({ ...material, questions: [{ ...q, answers: [] }] }, "폴더", ai),
    analysisFingerprint({ ...material, slides: [...material.slides].reverse() }, "폴더", ai),
    analysisFingerprint({ ...material, versionId: "v2" }, "폴더", ai),
    analysisFingerprint(material, "다른 폴더", ai),
    analysisFingerprint(material, "폴더", { ...ai, model: () => "other" }),
  ]) assert.notEqual(changed, base);
});

test("RPT-125: reuse ready results of the same inputs, join this server's run, and run again otherwise", () => {
  const row = (status: AnalysisRow["status"]) => ({ fingerprint: "f", status });
  assert.equal(nextStep(null, "f", false), "run");
  assert.equal(nextStep(row("ready"), "f", false), "use");
  assert.equal(nextStep(row("ready"), "g", false), "run");
  assert.equal(nextStep(row("running"), "f", true), "wait");
  // A `running` row with no run here was cut off by a restart.
  assert.equal(nextStep(row("running"), "f", false), "run");
  assert.equal(nextStep(row("failed"), "f", false), "run");
});

test("RPT-125: the dashboard view keeps question analyses with a slide id and reports a long-cut-off run as failed", () => {
  const stored: AnalysisRow = { material_id: "m", owner_id: "o", fingerprint: "f", status: "ready", error: null, started_at: new Date().toISOString(),
    slides: { category: "강의", failedPages: [], slides: [
      { slideId: "s1", page: 1, topic: "", questionSummary: "출처를 묻는다", suggestion: "", issues: [], metrics: {} as never },
      { slideId: "s2", page: 2, topic: "", content: "내용", questionSummary: "", suggestion: "", issues: [], metrics: {} as never },
      { page: 3, topic: "", questionSummary: "예전 형식", suggestion: "", metrics: {} as never }] },
    groups: [{ title: "출처", summary: "", questionIds: ["q1"] }], dashboard: null };
  assert.deepEqual(analysisView(stored), { status: "ready", error: null, slides: [{ slideId: "s1", summary: "출처를 묻는다" }], groups: stored.groups, en: null });
  const old = analysisView({ ...stored, status: "running", slides: null, groups: null, started_at: new Date(Date.now() - 16 * 60_000).toISOString() });
  assert.deepEqual([old.status, old.error, old.slides], ["failed", "ANALYSIS_INTERRUPTED", null]);
  assert.equal(analysisView(null).status, "none");
});

test("RPT-125: reopening a completed analysis reads the saved result without AI calls or writes", async () => {
  const saved: AnalysisRow = { material_id: "cached-material", owner_id: "owner", fingerprint: analysisFingerprint(material, "", ai),
    status: "ready", error: null, started_at: "2026-11-01T00:00:00.000Z",
    slides: { category: "강의", failedPages: [], slides: [
      { slideId: "s1", page: 1, topic: "출처", questionSummary: "근거를 확인하는 질문", suggestion: "", issues: [], metrics: {} as never }] },
    groups: [{ title: "출처", summary: "근거 확인", questionIds: ["q1"] }],
    dashboard: { en: { groups: [{ title: "Sources", summary: "Checking evidence" }], slides: [] } } };
  const filters: [string, unknown][] = [];
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => { filters.push([column, value]); return query; },
    maybeSingle: async () => ({ data: structuredClone(saved), error: null }),
    upsert: () => assert.fail("A saved analysis must not start another run"),
    update: () => assert.fail("A saved analysis must not be rewritten"),
  };
  const db = { from: (table: string) => { assert.equal(table, "material_analyses"); return query; } };
  const forbidden = async () => assert.fail("A saved analysis must not call AI");
  const cachedAi = { ...ai, json: forbidden, chat: forbidden };
  const source = { purposes: new Map(), materials: [] }, one = { ...material, id: saved.material_id, folderId: null };
  for (let visit = 0; visit < 2; visit++) {
    const result = await ensureAnalysis(db as never, cachedAi as never, saved.owner_id, source as never, one as never);
    assert.equal(result.run, null);
    assert.deepEqual(await result.ready, { ...saved.slides, groups: saved.groups });
    assert.deepEqual(analysisView(result.row), analysisView(saved));
  }
  assert.deepEqual(filters, [0, 1].flatMap(() => [["material_id", saved.material_id], ["owner_id", saved.owner_id]]));
});

test("RPT-125: two first requests at the same moment share one run", async () => {
  let row: unknown = null, upserts = 0;
  const later = <T>(value: T, ms = 20) => new Promise<T>((done) => setTimeout(() => done(value), ms));
  const db = { from: () => ({
    select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => later({ data: row, error: null }) }) }) }),
    upsert: (values: unknown) => ({ select: () => ({ single: () => { upserts++; row = values; return later({ data: values, error: null }); } }) }),
    // A slow "failed" save keeps the run registered while the second request checks.
    update: () => ({ eq: () => ({ eq: () => later({ error: null }, 200) }) }) }) };
  // The run itself fails at once (no slides, an AI that throws); only how many runs start matters here.
  const fail = async () => { throw new Error("AI_FAILED"); };
  const runAi = { ...ai, json: fail, chat: fail, imageEdge: () => 1456 };
  const source = { purposes: new Map(), materials: [] }, one = { ...material, id: "m", folderId: null, slides: [], questions: [] };
  const [a, b] = await Promise.all([0, 1].map(() => ensureAnalysis(db as never, runAi as never, "o", source as never, one as never)));
  await Promise.allSettled([a.ready, b.ready, a.run?.settled]);
  assert.equal(upserts, 1);
  assert.equal(a.ready, b.ready);
});
