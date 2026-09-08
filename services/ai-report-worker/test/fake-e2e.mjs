import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const workerUrl = (process.env.AI_REPORT_LOCAL_WORKER_URL ?? "http://127.0.0.1:8090").replace(/\/$/, "");
const sourceFile = process.argv[2];
const keepFixture = process.env.AI_REPORT_KEEP_FIXTURE === "true";
if (!supabaseUrl || !supabaseSecretKey || !supabasePublishableKey || !sourceFile) {
  throw new Error("SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY, and a source image path are required");
}

const client = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const fixture = {
  folderId: randomUUID(), courseId: randomUUID(), lectureId: randomUUID(), materialId: randomUUID(),
  versionId: randomUUID(), slideId: randomUUID(), anchorId: randomUUID(), questionId: randomUUID(),
};
let ownerId;
let participantId;
let sourcePath;
let evidencePrefix;
let loginUrl;

function ensure(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

try {
  const ownerEmail = `ai-e2e-${randomUUID()}@test.local`;
  const ownerPassword = `Local-${randomUUID()}-A1!`;
  const created = ensure(await client.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
  }), "create owner");
  ownerId = created.user.id;
  const ownerClient = createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  ensure(await ownerClient.auth.signInWithPassword({ email: ownerEmail, password: ownerPassword }), "sign in owner");
  const participantClient = createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const participant = ensure(await participantClient.auth.signInAnonymously(), "sign in participant");
  participantId = participant.user.id;
  const image = await readFile(sourceFile);
  sourcePath = `${ownerId}/${fixture.lectureId}/ai-e2e-slide.jpg`;

  ensure(await ownerClient.from("session_folders").insert({ id: fixture.folderId, owner_id: ownerId, name: "AI E2E" }), "insert folder");
  ensure(await ownerClient.from("courses").insert({ id: fixture.courseId, owner_id: ownerId, folder_id: fixture.folderId, title: "AI E2E" }), "insert course");
  ensure(await ownerClient.from("lectures").insert({ id: fixture.lectureId, course_id: fixture.courseId, title: "AI E2E", join_code: randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase(), status: "live" }), "insert lecture");
  ensure(await ownerClient.from("materials").insert({ id: fixture.materialId, course_id: fixture.courseId, lecture_id: fixture.lectureId, type: "pdf", file_name: "soi.pdf" }), "insert material");
  ensure(await ownerClient.from("material_versions").insert({ id: fixture.versionId, material_id: fixture.materialId, source_path: `${ownerId}/source.pdf`, checksum: createHash("sha256").update(image).digest("hex") }), "insert version");
  ensure(await ownerClient.from("slides").insert({ id: fixture.slideId, material_version_id: fixture.versionId, page_index: 0, image_path: sourcePath, image_checksum: createHash("sha256").update(image).digest("hex") }), "insert slide");
  ensure(await participantClient.from("region_anchors").insert({ id: fixture.anchorId, slide_id: fixture.slideId, material_version_id: fixture.versionId, kind: "point", coords: { x: 0.1, y: 0.055 }, created_by: "user" }), "insert anchor");
  ensure(await participantClient.from("questions").insert({ id: fixture.questionId, course_id: fixture.courseId, lecture_id: fixture.lectureId, slide_id: fixture.slideId, region_id: fixture.anchorId, author_id: participantId, category: "concept", marker: "pin", raw_text: "이 해결방안의 핵심은 무엇인가요?" }), "insert question");
  ensure(await ownerClient.storage.from("lecture-slides").upload(sourcePath, image, { contentType: "image/jpeg" }), "upload slide");

  const inspection = ensure(await client.rpc("inspect_ai_report_selection", {
    target_owner_id: ownerId,
    target_selection_kind: "material",
    target_folder_id: fixture.folderId,
    target_material_ids: [fixture.materialId],
  }), "inspect selection");
  const snapshot = ensure(await client.rpc("create_ai_report_snapshot", {
    target_owner_id: ownerId,
    target_selection_kind: "material",
    target_folder_id: fixture.folderId,
    target_material_ids: [fixture.materialId],
    target_expected_source_fingerprint: inspection.sourceFingerprint,
    target_idempotency_key: `ai-e2e-${randomUUID()}`,
    target_request_hash: createHash("sha256").update(randomUUID()).digest("hex"),
    target_model_fingerprint: "fake:local:fake-generation:fake/generation-v1:fake-critic:fake/critic-v1",
    target_prompt_version: "ai-report-prompts.v1",
    target_schema_version: "ai-report-canonical.v1",
    target_pricing_at: new Date().toISOString(),
    target_estimated_cost_min_usd: 0,
    target_estimated_cost_max_usd: 0,
  }), "create snapshot");

  const response = await fetch(`${workerUrl}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jobId: snapshot.jobId, stage: "prepare" }),
    signal: AbortSignal.timeout(120_000),
  });
  assert.equal(response.status, 204);

  const report = ensure(await client.from("ai_reports").select("status, canonical_result, progress_completed, progress_total").eq("id", snapshot.reportId).single(), "read report");
  assert.equal(report.status, "ready");
  assert.equal(report.progress_completed, report.progress_total);
  assert.equal(report.canonical_result.schemaVersion, "ai-report-canonical.v1");
  const slide = ensure(await client.from("ai_report_slides").select("analysis_result, evidence_prefix").eq("report_id", snapshot.reportId).single(), "read slide analysis");
  assert.ok(slide.analysis_result.regions.length > 0);
  assert.equal(slide.analysis_result.pinMappings[0].mappingStatus, "mapped");
  assert.ok(slide.analysis_result.pinMappings[0].regionAlias);
  evidencePrefix = slide.evidence_prefix;
  ensure(await client.storage.from("ai-report-evidence").download(`${evidencePrefix}/redacted.png`), "download evidence");
  if (keepFixture) {
    const link = ensure(await client.auth.admin.generateLink({
      type: "magiclink",
      email: ownerEmail,
      options: { redirectTo: `http://127.0.0.1:3000/auth/callback?next=${encodeURIComponent("/admin/folders/" + fixture.folderId + "?tab=insights")}` },
    }), "generate local login link");
    loginUrl = link.properties?.action_link;
  }
  process.stdout.write(JSON.stringify({
    status: report.status,
    regions: slide.analysis_result.regions.length,
    pinMapping: slide.analysis_result.pinMappings[0].regionAlias,
    ...(keepFixture ? { folderId: fixture.folderId, reportId: snapshot.reportId, loginUrl } : {}),
  }));
} finally {
  if (!keepFixture) {
    if (evidencePrefix) await client.storage.from("ai-report-evidence").remove([`${evidencePrefix}/redacted.png`, `${evidencePrefix}/analysis.json`]);
    if (sourcePath) await client.storage.from("lecture-slides").remove([sourcePath]);
    if (participantId) await client.auth.admin.deleteUser(participantId);
    if (ownerId) await client.auth.admin.deleteUser(ownerId);
  }
}
