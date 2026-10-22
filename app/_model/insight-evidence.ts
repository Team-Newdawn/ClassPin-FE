import type { NormalizedPoint, QuestionStatus } from "./types.ts";

// Snapshot aliases only. This module never accepts UI slide indexes or source text.
export type InsightAnchor =
  | { kind: "point"; x: number; y: number }
  | { kind: "box"; x: number; y: number; width: number; height: number }
  | { kind: "path"; points: readonly NormalizedPoint[] }
  | null;
export type InsightQuestion = {
  id: string;
  slideId: string;
  anchor: InsightAnchor;
  status: QuestionStatus;
  reactions: number;
  answerCount: number;
};
type Bounds = { left: number; top: number; right: number; bottom: number };

function unit(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("Invalid insight coordinate");
  return value;
}

export function anchorBounds(anchor: InsightAnchor): Bounds | null {
  if (anchor === null) return null;
  if (anchor.kind === "path") {
    if (!Array.isArray(anchor.points) || anchor.points.length < 2) throw new Error("Invalid insight path");
    const xs = anchor.points.map((point) => unit(point.x));
    const ys = anchor.points.map((point) => unit(point.y));
    return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
  }
  if (anchor.kind !== "point" && anchor.kind !== "box") throw new Error("Invalid insight anchor kind");
  const left = unit(anchor.x), top = unit(anchor.y);
  if (anchor.kind === "point") return { left, top, right: left, bottom: top };
  if (!(anchor.width > 0 && anchor.height > 0)) throw new Error("Invalid insight box size");
  return { left, top, right: unit(left + unit(anchor.width)), bottom: unit(top + unit(anchor.height)) };
}

/** AIR-EVID-012~017: preserve anchors; move the crop inside the image. */
export function insightCrop(anchor: InsightAnchor): Bounds | null {
  const bounds = anchorBounds(anchor);
  if (!bounds) return null;
  const padding = anchor?.kind === "point" ? 0 : 0.2;
  const width = Math.min(1, Math.max(0.4, bounds.right - bounds.left + padding));
  const height = Math.min(1, Math.max(0.4, bounds.bottom - bounds.top + padding));
  const left = Math.max(0, Math.min(1 - width, (bounds.left + bounds.right - width) / 2));
  const top = Math.max(0, Math.min(1 - height, (bounds.top + bounds.bottom - height) / 2));
  return { left, top, right: left + width, bottom: top + height };
}

/** Inputs must come from the owner-checked server snapshot, never browser counts. */
export function prepareInsightEvidence(slideIds: readonly string[], questions: readonly InsightQuestion[]) {
  const slides = new Set(slideIds);
  if (slides.size !== slideIds.length || slideIds.some((id) => !id.trim())) throw new Error("Invalid insight slides");
  const seen = new Set<string>();
  const ordered = [...questions].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  for (const question of ordered) {
    if (!question.id.trim() || seen.has(question.id)) throw new Error("Duplicate or empty insight question");
    if (!slides.has(question.slideId)) throw new Error("Unknown insight slide");
    if (!["unanswered", "answered", "resolved"].includes(question.status)) throw new Error("Invalid insight status");
    for (const count of [question.reactions, question.answerCount]) {
      if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid insight count");
    }
    seen.add(question.id);
  }
  return [...slides].sort().map((slideId) => {
    const items = ordered.filter((question) => question.slideId === slideId);
    if (items.length > 100) throw new Error("Insight slide question limit exceeded");
    const sum = (field: "reactions" | "answerCount") => {
      const total = items.reduce((value, item) => value + item[field], 0);
      if (!Number.isSafeInteger(total)) throw new Error("Insight count overflow");
      return total;
    };
    return {
      slideId,
      metrics: {
        questions: items.length,
        positioned: items.filter((item) => item.anchor !== null).length,
        unanswered: items.filter((item) => item.status === "unanswered").length,
        answered: items.filter((item) => item.status === "answered").length,
        resolved: items.filter((item) => item.status === "resolved").length,
        reactions: sum("reactions"),
        answers: sum("answerCount"),
      },
    };
  });
}
