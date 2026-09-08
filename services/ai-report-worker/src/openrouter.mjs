import { WorkerError } from "./errors.mjs";

function responseContent(value) {
  const content = value?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((item) => item?.text ?? "").join("");
  return "";
}

export async function generateStructured(config, { model, schemaName, schema, messages, maxTokens }) {
  if (config.providerMode === "fake") throw new WorkerError("AI_REPORT_FAKE_PROVIDER_MISROUTED");
  let response;
  const started = Date.now();
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.openRouterKey}`,
        "content-type": "application/json",
        "x-openrouter-cache": "false",
      },
      body: JSON.stringify({
        model,
        stream: false,
        temperature: 0,
        max_completion_tokens: maxTokens,
        messages,
        response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } },
        provider: {
          only: [config.provider],
          allow_fallbacks: false,
          require_parameters: true,
          data_collection: "deny",
          zdr: true,
        },
      }),
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
  } catch (cause) {
    throw new WorkerError("AI_REPORT_PROVIDER_UNAVAILABLE", { retryable: true, cause });
  }
  if (!response.ok) {
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    throw new WorkerError(retryable ? "AI_REPORT_PROVIDER_UNAVAILABLE" : "AI_REPORT_PROVIDER_REJECTED", { retryable });
  }
  const value = await response.json();
  const metadata = {
    model: String(value.model ?? model),
    provider: config.provider,
    requestId: String(value.id ?? ""),
    latencyMs: Date.now() - started,
    promptTokens: Number(value.usage?.prompt_tokens ?? 0),
    completionTokens: Number(value.usage?.completion_tokens ?? 0),
    costUsd: Number(value.usage?.cost ?? 0),
  };
  let content;
  try { content = JSON.parse(responseContent(value)); }
  catch (cause) { throw new WorkerError("AI_REPORT_OUTPUT_INVALID", { retryable: true, cause, usageMetadata: metadata }); }
  return {
    content,
    metadata,
  };
}
