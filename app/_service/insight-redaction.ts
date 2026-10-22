const sensitive = /[\w.+-]{1,128}@[\w.-]{1,253}\.[a-z]{2,63}|(?:\+?82[-. ]?|0)(?:1[016789]|2|[3-6]\d)[-. ]?\d{3,4}[-. ]?\d{4}|(?:\+\d{1,3}[-. ]?)?\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|(?:gsk_|sk-|AIza|ghp_|github_pat_)[A-Za-z0-9_-]{12,}|(?:bearer|api[_ -]?key|access[_ -]?token|secret)(?:\s*[:=]\s*|\s+)[A-Za-z0-9_.-]{8,}/i;

/** Mask entire lines: an OCR word may split an email or a key. */
export function redactInsightText(text: string) {
  if (text.length > 200_000) throw new Error("REDACTION_INPUT_LIMIT");
  return text.split(/\r?\n/).map((line) =>
    sensitive.test(line.normalize("NFKC")) || sensitive.test(line.normalize("NFKC").replace(/\s/g, "")) ? "[REDACTED]" : line).join("\n");
}
