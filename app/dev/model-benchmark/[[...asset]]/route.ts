import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only local experiment viewer. Never part of a production report API.
export async function GET(request: Request, context: { params: Promise<{ asset?: string[] }> }) {
  const url = new URL(request.url);
  if (process.env.NODE_ENV !== "development" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      !["127.0.0.1:3000", "localhost:3000", "[::1]:3000"].includes(request.headers.get("host") ?? "") ||
      request.headers.get("sec-fetch-site") === "cross-site") {
    return new Response("Not found", { status: 404 });
  }
  const { asset = [] } = await context.params;
  const file = asset.join("/") || "index.html";
  const allowed = /^(index\.html|visuals\.js|reports\.json|comparison\.md|(?:tesseract|easyocr|paddleocr|ppv3|pps|florence)\/page-(?:0[1-9]|1[0-5])\.jpg)$/;
  if (!allowed.test(file)) return new Response("Not found", { status: 404 });
  try {
    const content = await readFile(path.join(process.cwd(), "output/report-ablation-view/model-benchmark", file));
    const type = file.endsWith(".json") ? "application/json; charset=utf-8" : file.endsWith(".html") ? "text/html; charset=utf-8" : file.endsWith(".js") ? "text/javascript; charset=utf-8" : file.endsWith(".jpg") ? "image/jpeg" : "text/plain; charset=utf-8";
    const body = file === "index.html" ? content.toString("utf8").replace("<head>", '<head><base href="/dev/model-benchmark/">') : content;
    return new Response(body, { headers: {
      "Content-Type": type, "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'",
    } });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return new Response("실험 화면 파일이 없습니다. render_model_benchmark.py를 실행해 주세요.", { status: 404 });
  }
}
