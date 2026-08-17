export type TextSlideContent = {
  title: string;
  body: string;
};

const WIDTH = 1600;
const HEIGHT = 900;
const CONTENT_WIDTH = 1320;
const FONT_FAMILY = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", sans-serif';

function fitText(ctx: CanvasRenderingContext2D, value: string, maxWidth: number) {
  if (ctx.measureText(value).width <= maxWidth) return value;
  const characters = Array.from(value);
  while (characters.length && ctx.measureText(`${characters.join("")}…`).width > maxWidth) characters.pop();
  return `${characters.join("").trimEnd()}…`;
}

function wrapText(ctx: CanvasRenderingContext2D, value: string, maxWidth: number, maxLines: number) {
  const lines: string[] = [];
  const paragraphs = value.replace(/\r/g, "").split("\n");

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      if (lines.length) lines.push("");
      continue;
    }

    const words = paragraph.trim().split(/\s+/);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) {
        lines.push(line);
      }
      if (ctx.measureText(word).width <= maxWidth) {
        line = word;
        continue;
      }

      let fragment = "";
      for (const character of Array.from(word)) {
        if (ctx.measureText(fragment + character).width > maxWidth && fragment) {
          lines.push(fragment);
          fragment = character;
        } else {
          fragment += character;
        }
      }
      line = fragment;
    }
    if (line) lines.push(line);
  }

  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines && visible.length) visible[visible.length - 1] = fitText(ctx, `${visible[visible.length - 1]}…`, maxWidth);
  return visible;
}

/** 제목과 본문을 모든 플레이어가 그대로 표시할 수 있는 16:9 PNG로 만든다. */
export async function createTextSlideFile(content: TextSlideContent) {
  if (typeof document === "undefined") throw new Error("텍스트 슬라이드는 브라우저에서만 만들 수 있습니다.");
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("슬라이드 캔버스를 만들지 못했습니다.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#2867e8";
  ctx.fillRect(0, 0, WIDTH, 18);
  ctx.fillRect(112, 164, 12, 76);

  const title = content.title.trim();
  const body = content.body.trim();
  let bodyTop = 235;
  if (title) {
    ctx.fillStyle = "#171d26";
    ctx.font = `700 68px ${FONT_FAMILY}`;
    ctx.textBaseline = "top";
    const titleLines = wrapText(ctx, title, CONTENT_WIDTH, 3);
    titleLines.forEach((line, index) => ctx.fillText(line, 152, 156 + index * 88));
    bodyTop = 156 + titleLines.length * 88 + 54;
  }

  if (body) {
    ctx.fillStyle = "#3d4754";
    ctx.font = `400 36px ${FONT_FAMILY}`;
    ctx.textBaseline = "top";
    const availableLines = Math.max(1, Math.floor((760 - bodyTop) / 56));
    wrapText(ctx, body, CONTENT_WIDTH, availableLines)
      .forEach((line, index) => ctx.fillText(line, 152, bodyTop + index * 56));
  }

  ctx.fillStyle = "#d1d8e0";
  ctx.fillRect(112, 810, 1376, 2);
  ctx.fillStyle = "#7c8796";
  ctx.font = `600 20px ${FONT_FAMILY}`;
  ctx.textBaseline = "top";
  ctx.fillText("CLASS PIN", 112, 836);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("슬라이드 이미지를 만들지 못했습니다.")), "image/png");
  });
  return new File([blob], `text-slide-${Date.now()}.png`, { type: "image/png" });
}
