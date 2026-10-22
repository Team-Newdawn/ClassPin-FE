import assert from "node:assert/strict";
import test from "node:test";
import { redactInsightText } from "./insight-redaction.ts";

test("redacts sensitive lines, including OCR whitespace, without returning original strings", () => {
  for (const text of ["email: instructor@example.com", "010-1234-5678", "+82 10 1234 5678",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature", "gsk_abcdefghijklmnopqrstuv",
    "sk-proj-abcdefghijklmnopqrstuv", "AIzaabcdefghijklmnopqrstuv", "Bearer abcdefghijklmnopqrstuv",
    "instructor @ example.com", "api_key=abcdefghijklmnop"]) {
    assert.equal(redactInsightText(text), "[REDACTED]", text);
  }
  assert.equal(redactInsightText("Kant\n47 questions"), "Kant\n47 questions");
});
