import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.mjs";
import { safeWorkerError, WorkerError } from "./errors.mjs";
import { createProcessor } from "./processor.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNIT = /^S[0-9]{3}$/;

function readBody(request, limit = 4096) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) { reject(new WorkerError("AI_REPORT_TASK_INVALID")); request.destroy(); return; }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch (cause) { reject(new WorkerError("AI_REPORT_TASK_INVALID", { cause })); }
    });
    request.on("error", reject);
  });
}

export function validateTask(value) {
  const allowedKeys = value?.stage === "slide" ? ["jobId", "stage", "unitAlias"] : ["jobId", "stage"];
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !allowedKeys.includes(key)) || !UUID.test(value.jobId)
    || !["prepare", "slide", "synthesize"].includes(value.stage)
    || (value.stage === "slide" ? !UNIT.test(value.unitAlias) : value.unitAlias !== undefined)) {
    throw new WorkerError("AI_REPORT_TASK_INVALID");
  }
  return { jobId: value.jobId.toLowerCase(), stage: value.stage, ...(value.unitAlias ? { unitAlias: value.unitAlias } : {}) };
}

export function startServer(config = loadConfig(), processTask = createProcessor(config)) {
  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/healthz") { response.writeHead(200).end("ok"); return; }
    if (request.method !== "POST" || request.url !== "/tasks") { response.writeHead(404).end(); return; }
    try {
      const task = validateTask(await readBody(request));
      await processTask(task);
      response.writeHead(204).end();
    } catch (error) {
      const safe = safeWorkerError(error);
      console.error(JSON.stringify({ severity: "ERROR", code: safe.code, retryable: safe.retryable }));
      response.writeHead(safe.retryable ? 503 : 204).end();
    }
  });
  server.listen(config.port, "0.0.0.0", () => console.log(JSON.stringify({ severity: "INFO", event: "worker-ready", port: config.port })));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startServer();
