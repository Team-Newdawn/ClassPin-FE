const bbox = {
  type: "object",
  additionalProperties: false,
  required: ["x1", "y1", "x2", "y2"],
  properties: {
    x1: { type: "number", minimum: 0, maximum: 1 },
    y1: { type: "number", minimum: 0, maximum: 1 },
    x2: { type: "number", minimum: 0, maximum: 1 },
    y2: { type: "number", minimum: 0, maximum: 1 },
  },
};

export function slideAnalysisSchema(slideAlias) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion", "slideAlias", "slideSummary", "keyConcepts", "regions"],
    properties: {
      schemaVersion: { const: "ai-report-slide-analysis.v1" },
      slideAlias: { const: slideAlias },
      slideSummary: { type: "string", minLength: 1, maxLength: 800 },
      keyConcepts: { type: "array", maxItems: 12, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 80 } },
      regions: {
        type: "array", minItems: 1, maxItems: 12,
        items: {
          type: "object", additionalProperties: false,
          required: ["alias", "type", "bboxNorm", "readingOrder", "summary", "concepts", "importance", "confidence"],
          properties: {
            alias: { type: "string", pattern: "^R[0-9]{3}$" },
            type: { enum: ["title", "paragraph", "table", "chart", "formula", "code", "image", "diagram", "callout", "footer", "other"] },
            bboxNorm: bbox,
            readingOrder: { type: "integer", minimum: 1, maximum: 12 },
            summary: { type: "string", minLength: 1, maxLength: 500 },
            concepts: { type: "array", maxItems: 8, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 80 } },
            importance: { enum: ["low", "medium", "high"] },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
        },
      },
    },
  };
}

const claim = {
  type: "object", additionalProperties: false,
  required: ["id", "title", "body", "evidenceLevel", "evidenceRefs"],
  properties: {
    id: { type: "string", pattern: "^C[0-9]{3}$" },
    title: { type: "string", maxLength: 120 },
    body: { type: "string", minLength: 1, maxLength: 900 },
    evidenceLevel: { enum: ["sufficient", "limited", "insufficient"] },
    evidenceRefs: { type: "array", minItems: 1, maxItems: 20, uniqueItems: true, items: { type: "string", pattern: "^M[0-9]{3}/S[0-9]{3}/(?:R|Q)[0-9]{3}$" } },
  },
};

export const canonicalReportSchema = {
  type: "object", additionalProperties: false,
  required: ["schemaVersion", "overallEvidenceLevel", "executiveSummary", "confusionPoints", "unansweredQuestions", "improvementPriorities", "materials", "claimIds", "narrative"],
  properties: {
    schemaVersion: { const: "ai-report-canonical.v1" },
    overallEvidenceLevel: { enum: ["sufficient", "limited", "insufficient"] },
    executiveSummary: { type: "array", minItems: 1, maxItems: 8, items: claim },
    confusionPoints: { type: "array", maxItems: 20, items: claim },
    unansweredQuestions: { type: "array", maxItems: 30, items: claim },
    improvementPriorities: { type: "array", maxItems: 20, items: claim },
    materials: {
      type: "array", minItems: 1, maxItems: 20,
      items: {
        type: "object", additionalProperties: false,
        required: ["materialAlias", "title", "slides"],
        properties: {
          materialAlias: { type: "string", pattern: "^M[0-9]{3}$" },
          title: { type: "string", minLength: 1, maxLength: 120 },
          slides: {
            type: "array", minItems: 1, maxItems: 300,
            items: {
              type: "object", additionalProperties: false,
              required: ["slideAlias", "slideNumber", "title", "summary", "regionCount", "pinCount"],
              properties: {
                slideAlias: { type: "string", pattern: "^S[0-9]{3}$" },
                slideNumber: { type: "integer", minimum: 1, maximum: 300 },
                title: { type: "string", maxLength: 120 },
                summary: { type: "string", minLength: 1, maxLength: 800 },
                regionCount: { type: "integer", minimum: 1, maximum: 12 },
                pinCount: { type: "integer", minimum: 0, maximum: 100 },
              },
            },
          },
        },
      },
    },
    claimIds: { type: "array", minItems: 1, maxItems: 78, uniqueItems: true, items: { type: "string", pattern: "^C[0-9]{3}$" } },
    narrative: {
      type: "object", additionalProperties: false,
      required: ["title", "paragraphs"],
      properties: {
        title: { type: "string", minLength: 1, maxLength: 160 },
        paragraphs: { type: "array", minItems: 1, maxItems: 30, items: { type: "string", minLength: 1, maxLength: 1200 } },
      },
    },
  },
};

export const criticSchema = {
  type: "object", additionalProperties: false,
  required: ["schemaVersion", "pass", "issueCodes"],
  properties: {
    schemaVersion: { const: "ai-report-critic.v1" },
    pass: { type: "boolean" },
    issueCodes: { type: "array", maxItems: 12, uniqueItems: true, items: { enum: ["UNSUPPORTED_CLAIM", "BAD_EVIDENCE_REF", "OVERCONFIDENT", "MISSED_PIN", "PRIVACY_RISK", "INCONSISTENT_METRIC", "OTHER"] } },
  },
};
