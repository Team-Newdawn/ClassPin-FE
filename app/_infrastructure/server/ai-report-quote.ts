import { createHmac, timingSafeEqual } from "node:crypto";

export interface AiReportQuotePayload {
  version: "ai-report-quote.v1";
  ownerId: string;
  selectionKind: "material" | "materials" | "folder";
  folderId: string | null;
  materialIds: string[];
  materialCount: number;
  slideCount: number;
  questionCount: number;
  sourceFingerprint: string;
  pricingAt: string;
  estimatedCostMinUsd: number;
  estimatedCostMaxUsd: number;
  expiresAt: string;
}

function signature(encodedPayload: string, key: string) {
  return createHmac("sha256", key).update(encodedPayload).digest("base64url");
}

export function signAiReportQuote(payload: AiReportQuotePayload, key: string) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${signature(encodedPayload, key)}`;
}

export function verifyAiReportQuote(quote: string, key: string, now = Date.now()): AiReportQuotePayload | null {
  const [encodedPayload, encodedSignature, extra] = quote.split(".");
  if (!encodedPayload || !encodedSignature || extra) return null;
  const expected = Buffer.from(signature(encodedPayload, key));
  const actual = Buffer.from(encodedSignature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as AiReportQuotePayload;
    if (payload.version !== "ai-report-quote.v1" || new Date(payload.expiresAt).getTime() <= now) return null;
    return payload;
  } catch {
    return null;
  }
}
