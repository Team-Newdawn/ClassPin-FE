export const LAB_REPORT_ID = "ef98fa52-d24a-4d37-88ba-f840a6a2b187";
export const labModels = {
  ocr: [["tesseract", "Tesseract"], ["easyocr", "EasyOCR"], ["paddleocr", "한국어 PP-OCRv5"]],
  layout: [["ppv3", "PP-DocLayoutV3"], ["pps", "PP-DocLayout-S"], ["florence", "Florence-2"]],
  llm: [["qwen4", "Qwen3 4B"], ["qwen17", "Qwen3 1.7B"], ["granite2", "Granite 3.3 2B"]],
} as const;
export type LabSelection = { ocr: string; layout: string; llm: string };
export function validLabSelection(value: unknown): value is LabSelection {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (Object.keys(labModels) as Array<keyof LabSelection>).every(key => labModels[key].some(([id]) => id === row[key]));
}
export function labLocalRequest(request: Request, environment: string | undefined, databaseUrl: string | undefined) {
  if (environment !== "development" || !databaseUrl) return false;
  try {
    const url = new URL(request.url);
    const local = (host: string) => ["127.0.0.1", "localhost", "[::1]"].includes(host);
    const host = new URL(`${url.protocol}//${request.headers.get("host")}`);
    return local(url.hostname) && local(new URL(databaseUrl).hostname)
      && local(host.hostname) && host.port === url.port
      && request.headers.get("sec-fetch-site") !== "cross-site"
      && (!request.headers.has("origin") || request.headers.get("origin") === host.origin);
  } catch { return false; }
}
