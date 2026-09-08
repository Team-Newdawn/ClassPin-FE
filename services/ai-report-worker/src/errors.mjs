export class WorkerError extends Error {
  constructor(code, { retryable = false, cause, usageMetadata } = {}) {
    super(code, { cause });
    this.name = "WorkerError";
    this.code = code;
    this.retryable = retryable;
    this.usageMetadata = usageMetadata;
  }
}

export function safeWorkerError(error) {
  if (error instanceof WorkerError) return error;
  return new WorkerError("AI_REPORT_INTERNAL", { retryable: true, cause: error });
}
