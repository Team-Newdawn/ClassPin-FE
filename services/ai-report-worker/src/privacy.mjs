import { spawn } from "node:child_process";
import { WorkerError } from "./errors.mjs";

const SENSITIVE_RULES = [
  { kind: "email", pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu },
  { kind: "phone", pattern: /(?:\+?82[-\s]?)?0?1[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/gu },
  { kind: "resident-id", pattern: /\b\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[-\s]?[1-4]\d{6}\b/gu },
  { kind: "student-id", pattern: /\b(?:학번|student\s*id)\s*[:#]?\s*[A-Z0-9-]{5,20}\b/giu },
  { kind: "api-key", pattern: /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{20,})\b/gu },
  { kind: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/gu },
];

export function redactText(input) {
  let text = String(input ?? "");
  let count = 0;
  for (const { pattern } of SENSITIVE_RULES) {
    text = text.replace(pattern, () => { count += 1; return "[REDACTED]"; });
  }
  return { text, count };
}

export function containsSensitiveText(input) {
  const value = String(input ?? "");
  return SENSITIVE_RULES.some(({ pattern }) => { pattern.lastIndex = 0; return pattern.test(value); });
}

function run(command, args, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new WorkerError("AI_REPORT_OCR_TIMEOUT", { retryable: true })); }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", (cause) => { clearTimeout(timer); reject(new WorkerError("AI_REPORT_OCR_FAILED", { cause })); });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new WorkerError("AI_REPORT_OCR_FAILED", { cause: new Error(Buffer.concat(stderr).toString("utf8").slice(0, 200)) }));
      resolve(Buffer.concat(stdout).toString("utf8"));
    });
  });
}

export function parseTesseractTsv(tsv) {
  const rows = String(tsv).split(/\r?\n/).slice(1).flatMap((line) => {
    const fields = line.split("\t");
    if (fields.length < 12) return [];
    const confidence = Number(fields[10]);
    const text = fields.slice(11).join("\t").trim();
    if (!text || confidence < 20) return [];
    return [{
      key: fields.slice(1, 5).join("/"),
      left: Number(fields[6]), top: Number(fields[7]), width: Number(fields[8]), height: Number(fields[9]),
      confidence, text,
    }];
  });
  if (rows.some((row) => ![row.left, row.top, row.width, row.height].every(Number.isFinite))) throw new WorkerError("AI_REPORT_OCR_FAILED");
  return rows;
}

export function parseTesseractPageSize(tsv) {
  const page = String(tsv).split(/\r?\n/).slice(1).find((line) => line.startsWith("1\t"));
  const fields = page?.split("\t") ?? [];
  const width = Number(fields[8]);
  const height = Number(fields[9]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new WorkerError("AI_REPORT_OCR_FAILED");
  }
  return { width, height };
}

function redactionBoxes(words) {
  const byLine = Map.groupBy(words, (word) => word.key);
  const boxes = [];
  const sensitiveKeys = new Set();
  let matches = 0;
  for (const lineWords of byLine.values()) {
    const line = lineWords.map((word) => word.text).join(" ");
    const kinds = SENSITIVE_RULES.flatMap(({ kind, pattern }) => {
      pattern.lastIndex = 0;
      return pattern.test(line) ? [kind] : [];
    });
    if (!kinds.length) continue;
    sensitiveKeys.add(lineWords[0].key);
    matches += 1;
    const left = Math.min(...lineWords.map((word) => word.left));
    const top = Math.min(...lineWords.map((word) => word.top));
    const right = Math.max(...lineWords.map((word) => word.left + word.width));
    const bottom = Math.max(...lineWords.map((word) => word.top + word.height));
    boxes.push({ left, top, right, bottom, kinds });
  }
  return { boxes, matches, sensitiveKeys };
}

export async function ocrAndRedact(inputPath, outputPath) {
  const normalizedPath = `${outputPath}.normalized.png`;
  await run("convert", [inputPath, "-auto-orient", "-strip", normalizedPath], 60_000);
  const tsv = await run("tesseract", [normalizedPath, "stdout", "-l", "kor+eng", "--psm", "11", "tsv"], 90_000);
  const pageSize = parseTesseractPageSize(tsv);
  const words = parseTesseractTsv(tsv);
  if (!words.length) throw new WorkerError("AI_REPORT_OCR_EMPTY", { retryable: false });
  const { boxes, matches, sensitiveKeys } = redactionBoxes(words);
  const drawArgs = boxes.flatMap((box) => ["-draw", `rectangle ${box.left},${box.top} ${box.right},${box.bottom}`]);
  await run("convert", [normalizedPath, "-fill", "#101827", ...drawArgs, "-strip", outputPath], 60_000);
  const redactedWords = words.map((word) => ({ ...word, text: sensitiveKeys.has(word.key) ? "[REDACTED]" : redactText(word.text).text }));
  return {
    words: redactedWords,
    pageSize,
    redactionRecord: {
      schemaVersion: "ai-report-redaction.v1",
      engine: "tesseract-5-kor-eng",
      ruleVersion: "ai-report-sensitive-patterns.v1",
      sensitiveLineCount: matches,
      redactedBoxCount: boxes.length,
      regions: boxes.map((box) => ({
        kinds: box.kinds,
        bboxNorm: {
          x1: box.left / pageSize.width,
          y1: box.top / pageSize.height,
          x2: box.right / pageSize.width,
          y2: box.bottom / pageSize.height,
        },
      })),
    },
  };
}

export function sanitizeQuestionSnapshot(snapshot) {
  const questions = Array.isArray(snapshot?.questions) ? snapshot.questions : [];
  let redactionCount = 0;
  const sanitized = questions.map((question) => {
    const questionText = redactText(question.text);
    redactionCount += questionText.count;
    return {
      questionAlias: String(question.questionAlias ?? ""),
      text: questionText.text,
      category: String(question.category ?? ""),
      status: String(question.status ?? ""),
      reactionCount: Number(question.reactionCount ?? 0),
      anchor: question.anchor ?? null,
      answers: (Array.isArray(question.answers) ? question.answers : []).map((answer) => {
        const body = redactText(answer?.body);
        redactionCount += body.count;
        return { body: body.text };
      }),
    };
  });
  return { snapshot: { schemaVersion: "ai-report-question-ai-input.v1", questions: sanitized }, redactionCount };
}
