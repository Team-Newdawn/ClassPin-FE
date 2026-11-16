/**
 * RPT-037: a chart section's graph as one SVG string, drawn the same way by the editor and every file export (PDF, DOCX and
 * PPTX embed it as a picture). Labels come from report text, so every one is escaped.
 */

// OhPin tokens (app/_design-system/tokens.css); exports can't read CSS variables.
export const C = { brand: "#0f62fe", brandSoft: "#dce8ff", text: "#141f38", secondary: "#53627f", tertiary: "#7483a0", border: "#dde2ec", page: "#f4f6fa" };
export type ChartKind = "line" | "bar";
export type ChartPoint = { label: string; value: number };

const W = 640, FONT = `font-family="NanumGothic, 'Apple SD Gothic Neo', sans-serif"`;
const escape = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
const clip = (value: string, limit: number) => [...value].length > limit ? `${[...value].slice(0, limit - 1).join("")}…` : value;
const text = (x: number, y: number, value: string, attrs = "") => `<text x="${x}" y="${y}" ${FONT} ${attrs}>${escape(value)}</text>`;

/** Line: slides in order, so hundreds of points still fit one width; bar: a few categories, largest first, as horizontal bars. */
export function chartSvg(points: readonly ChartPoint[], kind: ChartKind, title: string) {
  const max = Math.max(1, ...points.map((point) => point.value)), peak = Math.max(...points.map((point) => point.value));
  let body: string, height: number;
  if (kind === "line") {
    height = 240;
    const left = 40, right = 16, top = 28, bottom = 36, plotW = W - left - right, plotH = height - top - bottom;
    const x = (index: number) => left + ((index + .5) / points.length) * plotW, y = (value: number) => top + (1 - value / max) * plotH;
    const ticks = [...new Set([0, Math.round(max / 2), max])];
    // ponytail: at most ~10 slide labels; the table under the chart keeps every value.
    const step = Math.ceil(points.length / 10), first = points.findIndex((point) => point.value === peak);
    body = ticks.map((tick) => `<line x1="${left}" x2="${W - right}" y1="${y(tick)}" y2="${y(tick)}" stroke="${C.border}"/>`
        + text(left - 8, y(tick) + 4, `${tick}`, `font-size="11" fill="${C.tertiary}" text-anchor="end"`)).join("")
      + `<polyline points="${points.map((point, index) => `${x(index)},${y(point.value)}`).join(" ")}" fill="none" stroke="${C.brand}" stroke-width="2" stroke-linejoin="round"/>`
      + (points.length <= 40 ? points.map((point, index) => `<circle cx="${x(index)}" cy="${y(point.value)}" r="3" fill="${C.brand}"/>`).join("") : "")
      + (peak > 0 ? `<circle cx="${x(first)}" cy="${y(peak)}" r="5" fill="${C.brand}" stroke="#fff" stroke-width="2"/>`
        + text(x(first), y(peak) - 10, `${peak}`, `font-size="12" font-weight="700" fill="${C.brand}" text-anchor="middle"`) : "")
      + points.map((point, index) => index % step && index !== points.length - 1 ? ""
        : text(x(index), height - 14, clip(point.label, 8), `font-size="11" fill="${C.tertiary}" text-anchor="middle"`)).join("");
  } else {
    const row = 30, labelW = 180, valueW = 48, barX = labelW + 12, barW = W - barX - valueW;
    height = points.length * row + 8;
    body = points.map((point, index) => {
      const top = 4 + index * row, width = Math.max(2, (point.value / max) * barW);
      return text(0, top + 19, clip(point.label, 14), `font-size="13" fill="${C.text}"`)
        + `<rect x="${barX}" y="${top + 8}" width="${barW}" height="12" rx="6" fill="${C.page}"/>`
        + `<rect x="${barX}" y="${top + 8}" width="${width}" height="12" rx="6" fill="${point.value === peak ? C.brand : C.brandSoft}"/>`
        + text(W, top + 19, `${point.value}`, `font-size="12" font-weight="700" fill="${C.secondary}" text-anchor="end"`);
    }).join("");
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" role="img" aria-label="${escape(title)}">`
    + `<title>${escape(title)}</title><rect width="${W}" height="${height}" fill="#fff"/>${body}</svg>`;
  return { svg, width: W, height };
}
