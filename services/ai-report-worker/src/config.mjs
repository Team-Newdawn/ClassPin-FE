import { WorkerError } from "./errors.mjs";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new WorkerError("AI_REPORT_CONFIG_INVALID");
  return value;
}

function positiveInteger(name, fallback, minimum, maximum) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new WorkerError("AI_REPORT_CONFIG_INVALID");
  return value;
}

function positiveNumber(name) {
  const value = Number(required(name));
  if (!Number.isFinite(value) || value <= 0) throw new WorkerError("AI_REPORT_CONFIG_INVALID");
  return value;
}

export function loadConfig() {
  const providerMode = process.env.AI_REPORT_PROVIDER_MODE === "fake" ? "fake" : "openrouter";
  if (providerMode === "fake" && process.env.NODE_ENV === "production") throw new WorkerError("AI_REPORT_CONFIG_INVALID");
  const generationModel = providerMode === "fake" ? "fake/generation-v1" : required("AI_REPORT_GENERATION_MODEL");
  const criticModel = providerMode === "fake" ? "fake/critic-v1" : required("AI_REPORT_CRITIC_MODEL");
  const generationModelFamily = providerMode === "fake" ? "fake-generation" : required("AI_REPORT_GENERATION_MODEL_FAMILY");
  const criticModelFamily = providerMode === "fake" ? "fake-critic" : required("AI_REPORT_CRITIC_MODEL_FAMILY");
  if (generationModel === criticModel || generationModelFamily === criticModelFamily) {
    throw new WorkerError("AI_REPORT_CONFIG_INVALID");
  }
  return Object.freeze({
    port: positiveInteger("PORT", 8080, 1, 65535),
    providerMode,
    generationModel,
    criticModel,
    generationModelFamily,
    criticModelFamily,
    provider: providerMode === "fake" ? "local" : required("AI_REPORT_OPENROUTER_PROVIDER"),
    openRouterKey: providerMode === "fake" ? "" : required("OPENROUTER_API_KEY"),
    supabaseUrl: required("SUPABASE_URL"),
    supabaseSecretKey: required("SUPABASE_SECRET_KEY"),
    taskLeaseSeconds: positiveInteger("AI_REPORT_TASK_LEASE_SECONDS", 600, 30, 900),
    requestTimeoutMs: positiveInteger("AI_REPORT_PROVIDER_TIMEOUT_MS", 120000, 10000, 300000),
    maxSlideTokens: positiveInteger("AI_REPORT_MAX_SLIDE_TOKENS", 2200, 256, 8000),
    maxReportTokens: positiveInteger("AI_REPORT_MAX_REPORT_TOKENS", 6000, 512, 16000),
    hardCapUsd: Number(process.env.AI_REPORT_HARD_CAP_USD ?? 25),
    maxSlideGenerationCallCostUsd: providerMode === "fake" ? 0 : positiveNumber("AI_REPORT_MAX_SLIDE_GENERATION_CALL_COST_USD"),
    maxSlideCriticCallCostUsd: providerMode === "fake" ? 0 : positiveNumber("AI_REPORT_MAX_SLIDE_CRITIC_CALL_COST_USD"),
    maxReportGenerationCallCostUsd: providerMode === "fake" ? 0 : positiveNumber("AI_REPORT_MAX_REPORT_GENERATION_CALL_COST_USD"),
    maxReportCriticCallCostUsd: providerMode === "fake" ? 0 : positiveNumber("AI_REPORT_MAX_REPORT_CRITIC_CALL_COST_USD"),
    projectId: process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCP_PROJECT_ID ?? "",
    queueLocation: process.env.CLOUD_TASKS_LOCATION ?? "",
    queueName: process.env.CLOUD_TASKS_QUEUE ?? "",
    workerUrl: (process.env.AI_REPORT_WORKER_URL ?? "").replace(/\/$/, ""),
    taskServiceAccount: process.env.CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL ?? "",
  });
}
