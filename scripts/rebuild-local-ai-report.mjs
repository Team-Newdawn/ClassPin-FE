import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { fakeCanonical } from "../services/ai-report-worker/src/fake-provider.mjs";
import { evidenceRefs } from "../services/ai-report-worker/src/mapping.mjs";
import { validateCanonicalReport } from "../services/ai-report-worker/src/validation.mjs";

const reportId = process.argv[2];
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
if (!reportId || !supabaseUrl || !supabaseSecretKey) {
  throw new Error("Usage: SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/rebuild-local-ai-report.mjs <report-id>");
}

const hostname = new URL(supabaseUrl).hostname;
if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
  throw new Error("This repair utility is restricted to local Supabase.");
}

const client = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function ensure(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

const report = ensure(await client.from("ai_reports")
  .select("id, owner_id, status, current_revision_id")
  .eq("id", reportId)
  .single(), "read report");
if (report.status === "confirmed") throw new Error("Confirmed reports are immutable.");

const materialRows = ensure(await client.from("ai_report_materials")
  .select("id, material_alias, ordinal, title_snapshot")
  .eq("report_id", reportId)
  .order("ordinal"), "read report materials");
const slideRows = ensure(await client.from("ai_report_slides")
  .select("report_material_id, slide_alias, ordinal, page_index, analysis_result")
  .eq("report_id", reportId)
  .eq("processing_status", "succeeded")
  .order("ordinal"), "read report slides");

const materials = materialRows.map((row) => ({
  materialAlias: row.material_alias,
  title: row.title_snapshot,
  slides: slideRows.filter((slide) => slide.report_material_id === row.id).map((slide) => ({
    slideAlias: slide.slide_alias,
    slideNumber: slide.page_index + 1,
    summary: slide.analysis_result.slideSummary,
    keyConcepts: slide.analysis_result.keyConcepts ?? [],
    regions: slide.analysis_result.regions ?? [],
    pins: slide.analysis_result.pinMappings ?? [],
  })),
}));
if (!materials.length || materials.some((material) => !material.slides.length)) {
  throw new Error("Report analysis data is incomplete.");
}

const knownRefs = new Set();
materials.forEach((material) => material.slides.forEach((slide) => {
  evidenceRefs(material.materialAlias, slide.slideAlias, slide.regions, slide.pins).forEach((ref) => knownRefs.add(ref));
}));
const expected = materials.map((material) => ({
  materialAlias: material.materialAlias,
  title: material.title,
  slides: material.slides.map((slide) => ({
    slideAlias: slide.slideAlias,
    slideNumber: slide.slideNumber,
    regionCount: slide.regions.length,
    pinCount: slide.pins.length,
  })),
}));
const canonical = validateCanonicalReport(fakeCanonical(materials), knownRefs, expected);

const latestRevision = ensure(await client.from("ai_report_revisions")
  .select("revision_no")
  .eq("report_id", reportId)
  .order("revision_no", { ascending: false })
  .limit(1)
  .single(), "read latest revision");
const revisionId = randomUUID();
ensure(await client.from("ai_report_revisions").insert({
  id: revisionId,
  report_id: report.id,
  owner_id: report.owner_id,
  revision_no: latestRevision.revision_no + 1,
  kind: "full",
  previous_revision_id: report.current_revision_id,
  status: "ready",
  display_result: canonical,
  selected_claim_ids: canonical.claimIds,
  code_validation: { schemaVersion: "ai-report-code-validation.v1", pass: true, knownEvidenceRefCount: knownRefs.size },
  critic_result: { schemaVersion: "ai-report-critic.v1", pass: true, issueCodes: [] },
  usage_record: { schemaVersion: "ai-report-usage.v1", calls: [], localRebuild: true },
}), "create full revision");
ensure(await client.from("ai_reports").update({
  canonical_result: canonical,
  current_revision_id: revisionId,
}).eq("id", reportId).select("id").single(), "publish full revision");

process.stdout.write(JSON.stringify({
  reportId,
  revision: latestRevision.revision_no + 1,
  slides: materials.reduce((count, material) => count + material.slides.length, 0),
  summary: canonical.executiveSummary.length,
  confusion: canonical.confusionPoints.length,
  unanswered: canonical.unansweredQuestions.length,
  priorities: canonical.improvementPriorities.length,
}));
