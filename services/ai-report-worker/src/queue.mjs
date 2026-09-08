import { createHash } from "node:crypto";
import { WorkerError } from "./errors.mjs";

async function metadataToken() {
  const response = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {
    headers: { "metadata-flavor": "Google" }, signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new WorkerError("AI_REPORT_QUEUE_AUTH_FAILED", { retryable: true });
  const value = await response.json();
  if (!value.access_token) throw new WorkerError("AI_REPORT_QUEUE_AUTH_FAILED", { retryable: true });
  return value.access_token;
}

export async function enqueueTask(config, payload) {
  const suffix = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32);
  if (config.providerMode === "fake") {
    const response = await fetch(`${config.workerUrl || `http://127.0.0.1:${config.port}`}/tasks`, {
      method: "POST", headers: { "content-type": "application/json", "x-classpin-local-task": "1" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new WorkerError("AI_REPORT_QUEUE_FAILED", { retryable: true });
    return;
  }
  if (!config.projectId || !config.queueLocation || !config.queueName || !config.workerUrl || !config.taskServiceAccount) throw new WorkerError("AI_REPORT_CONFIG_INVALID");
  const token = await metadataToken();
  const parent = `projects/${config.projectId}/locations/${config.queueLocation}/queues/${config.queueName}`;
  const response = await fetch(`https://cloudtasks.googleapis.com/v2/${parent}/tasks`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ task: { name: `${parent}/tasks/ai-report-${suffix}`, httpRequest: { httpMethod: "POST", url: `${config.workerUrl}/tasks`, headers: { "Content-Type": "application/json" }, body: Buffer.from(JSON.stringify(payload)).toString("base64"), oidcToken: { serviceAccountEmail: config.taskServiceAccount, audience: config.workerUrl } } } }),
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 409) return;
  if (!response.ok) throw new WorkerError("AI_REPORT_QUEUE_FAILED", { retryable: true });
}
