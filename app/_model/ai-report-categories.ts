export const pinCategoryLabels = {
  why: { ko: "근거·이유", en: "Reasons & evidence" },
  example: { ko: "구체적 예시", en: "Examples" },
  concept: { ko: "개념 설명", en: "Concepts" },
  important: { ko: "핵심 강조", en: "Key points" },
  other: { ko: "기타·미분류", en: "Other / unclassified" },
} as const;
export type PinCategory = keyof typeof pinCategoryLabels;
export type ReportCategoryPin = { evidenceRef: string; category: string; text: string; page: number };

export function groupReportPins(pins: ReportCategoryPin[]) {
  const seen = new Set<string>();
  const groups = (Object.keys(pinCategoryLabels) as PinCategory[]).map((category) => ({ category, pins: [] as ReportCategoryPin[] }));
  for (const pin of pins) {
    if (seen.has(pin.evidenceRef)) continue;
    seen.add(pin.evidenceRef);
    const category = Object.hasOwn(pinCategoryLabels, pin.category) ? pin.category as PinCategory : "other";
    groups.find((group) => group.category === category)!.pins.push(pin);
  }
  return groups.filter((group) => group.pins.length > 0);
}
