import assert from "node:assert/strict";
import test from "node:test";
import { signAiReportQuote, verifyAiReportQuote, type AiReportQuotePayload } from "./ai-report-quote.ts";

const key = "local-test-key-that-is-at-least-32-bytes-long";
const payload: AiReportQuotePayload = {
  version: "ai-report-quote.v1",
  ownerId: "3373b744-a42f-4e89-b71e-07ffe1b3b245",
  selectionKind: "material",
  folderId: null,
  materialIds: ["2373b744-a42f-4e89-b71e-07ffe1b3b245"],
  materialCount: 1,
  slideCount: 8,
  questionCount: 1,
  sourceFingerprint: "a".repeat(64),
  pricingAt: "2026-09-07T00:00:00.000Z",
  estimatedCostMinUsd: 0.1,
  estimatedCostMaxUsd: 0.3,
  expiresAt: "2026-09-07T00:10:00.000Z",
};

test("AI report quote detects tampering and expiration", () => {
  const quote = signAiReportQuote(payload, key);
  assert.deepEqual(verifyAiReportQuote(quote, key, Date.parse("2026-09-07T00:05:00.000Z")), payload);
  assert.equal(verifyAiReportQuote(`${quote}x`, key, Date.parse("2026-09-07T00:05:00.000Z")), null);
  assert.equal(verifyAiReportQuote(quote, key, Date.parse("2026-09-07T00:11:00.000Z")), null);
});
