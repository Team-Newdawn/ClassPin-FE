import { createHash } from "node:crypto";
import { AdminApiError } from "./admin-api";

interface CloudTaskConfig {
  projectId: string;
  location: string;
  queue: string;
  workerUrl: string;
  serviceAccountEmail: string;
}

function getCloudTaskConfig(): CloudTaskConfig {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCP_PROJECT_ID;
  const location = process.env.CLOUD_TASKS_LOCATION;
  const queue = process.env.CLOUD_TASKS_QUEUE;
  const workerUrl = process.env.AI_REPORT_WORKER_URL;
  const serviceAccountEmail = process.env.CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL;
  if (!projectId || !location || !queue || !workerUrl || !serviceAccountEmail) {
    throw new AdminApiError(503, "AI_REPORT_QUEUE_NOT_CONFIGURED");
  }
  return { projectId, location, queue, workerUrl: workerUrl.replace(/\/$/, ""), serviceAccountEmail };
}

async function getMetadataAccessToken() {
  const response = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" }, cache: "no-store", signal: AbortSignal.timeout(5_000) },
  );
  if (!response.ok) throw new AdminApiError(503, "AI_REPORT_QUEUE_AUTH_FAILED", true);
  const value = await response.json() as { access_token?: string };
  if (!value.access_token) throw new AdminApiError(503, "AI_REPORT_QUEUE_AUTH_FAILED", true);
  return value.access_token;
}

export function assertAiReportDispatchConfigured(providerMode: "openrouter" | "fake") {
  if (providerMode === "fake") return;
  getCloudTaskConfig();
}

export async function enqueueAiReportJob(jobId: string, providerMode: "openrouter" | "fake", stage: "prepare" | "synthesize" = "prepare") {
  if (providerMode === "fake") {
    const localWorkerUrl = (process.env.AI_REPORT_LOCAL_WORKER_URL ?? "http://127.0.0.1:8090").replace(/\/$/, "");
    const response = await fetch(`${localWorkerUrl}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId, stage }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new AdminApiError(503, "AI_REPORT_QUEUE_FAILED", true);
    return;
  }
  const config = getCloudTaskConfig();
  const accessToken = await getMetadataAccessToken();
  const parent = `projects/${config.projectId}/locations/${config.location}/queues/${config.queue}`;
  const taskSuffix = createHash("sha256").update(`${jobId}:${stage}`).digest("hex").slice(0, 32);
  const payload = Buffer.from(JSON.stringify({ jobId, stage }), "utf8").toString("base64");
  const response = await fetch(`https://cloudtasks.googleapis.com/v2/${parent}/tasks`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      task: {
        name: `${parent}/tasks/ai-report-${taskSuffix}`,
        httpRequest: {
          httpMethod: "POST",
          url: `${config.workerUrl}/tasks`,
          headers: { "Content-Type": "application/json" },
          body: payload,
          oidcToken: {
            serviceAccountEmail: config.serviceAccountEmail,
            audience: config.workerUrl,
          },
        },
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 409) return;
  if (!response.ok) throw new AdminApiError(503, "AI_REPORT_QUEUE_FAILED", true);
}
