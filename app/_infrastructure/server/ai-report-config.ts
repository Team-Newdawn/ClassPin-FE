import { AdminApiError } from "./admin-api";

export interface AiReportRuntimeConfig {
  providerMode: "openrouter" | "fake";
  generationModel: string;
  criticModel: string;
  generationModelFamily: string;
  criticModelFamily: string;
  provider: string;
  pricingAt: string;
  estimatedCostPerSlideUsd: number;
  confirmationThresholdUsd: number;
  hardCapUsd: number;
  quoteHmacKey: string;
}

function finiteNonNegative(name: string, fallback?: number) {
  const raw = process.env[name];
  const value = raw === undefined && fallback !== undefined ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new AdminApiError(503, "AI_REPORT_CONFIG_INVALID");
  return value;
}

export function getAiReportRuntimeConfig(): AiReportRuntimeConfig {
  if (process.env.AI_REPORT_ENABLED !== "true") {
    throw new AdminApiError(503, "AI_REPORT_DISABLED");
  }
  const providerMode = process.env.AI_REPORT_PROVIDER_MODE === "fake" ? "fake" : "openrouter";
  if (providerMode === "fake" && process.env.NODE_ENV === "production") {
    throw new AdminApiError(503, "AI_REPORT_CONFIG_INVALID");
  }
  const generationModel = providerMode === "fake" ? "fake/generation-v1" : process.env.AI_REPORT_GENERATION_MODEL;
  const criticModel = providerMode === "fake" ? "fake/critic-v1" : process.env.AI_REPORT_CRITIC_MODEL;
  const generationModelFamily = providerMode === "fake" ? "fake-generation" : process.env.AI_REPORT_GENERATION_MODEL_FAMILY;
  const criticModelFamily = providerMode === "fake" ? "fake-critic" : process.env.AI_REPORT_CRITIC_MODEL_FAMILY;
  const provider = providerMode === "fake" ? "local" : process.env.AI_REPORT_OPENROUTER_PROVIDER;
  const pricingAt = providerMode === "fake" ? new Date().toISOString() : process.env.AI_REPORT_PRICING_AT;
  const quoteHmacKey = process.env.AI_REPORT_QUOTE_HMAC_KEY;
  if (!generationModel || !criticModel || !generationModelFamily || !criticModelFamily || !provider || !pricingAt || !quoteHmacKey || quoteHmacKey.length < 32) {
    throw new AdminApiError(503, "AI_REPORT_CONFIG_INVALID");
  }
  if (generationModel === criticModel || generationModelFamily === criticModelFamily) throw new AdminApiError(503, "AI_REPORT_CONFIG_INVALID");
  const pricingAge = Date.now() - new Date(pricingAt).getTime();
  if (!Number.isFinite(pricingAge) || pricingAge < 0 || pricingAge > 86_400_000) {
    throw new AdminApiError(503, "AI_REPORT_PRICING_STALE");
  }
  return {
    providerMode,
    generationModel,
    criticModel,
    generationModelFamily,
    criticModelFamily,
    provider,
    pricingAt,
    estimatedCostPerSlideUsd: providerMode === "fake" ? 0 : finiteNonNegative("AI_REPORT_ESTIMATED_COST_PER_SLIDE_USD"),
    confirmationThresholdUsd: finiteNonNegative("AI_REPORT_CONFIRMATION_THRESHOLD_USD", 1),
    hardCapUsd: finiteNonNegative("AI_REPORT_HARD_CAP_USD", 25),
    quoteHmacKey,
  };
}

export function aiReportModelFingerprint(config: AiReportRuntimeConfig) {
  return `${config.providerMode}:${config.provider}:${config.generationModelFamily}:${config.generationModel}:${config.criticModelFamily}:${config.criticModel}`;
}
