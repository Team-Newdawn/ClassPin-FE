import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pickCategory, chatContext, viewSlides, slideImageEdge, readableText, slidesMentioned } from "./insight-claude.ts";

test("slideImageEdge keeps every page within Claude's 1568px / 1568-token image budget", () => {
  const tokens = (w: number, h: number) => Math.ceil(w / 28) * Math.ceil(h / 28);
  for (const sizes of [[{ width: 1920, height: 1080 }], [{ width: 960, height: 720 }], [{ width: 595, height: 842 }], [{ width: 1920, height: 1080 }, { width: 595, height: 842 }]]) {
    const edge = slideImageEdge(sizes);
    for (const { width, height } of sizes) {
      const scale = edge / Math.max(width, height);
      assert.ok(edge <= 1568 && tokens(Math.round(width * scale) + 1, Math.round(height * scale) + 1) <= 1568, `${width}x${height} at ${edge}`);
    }
  }
  assert.equal(slideImageEdge([{ width: 1920, height: 1080 }]), 1455);
});

test("readableText rejects design-tool PDFs whose text layer maps glyphs to garbage", () => {
  assert.ok(readableText("지역별 강좌 수강 현황 (단위: 명)\n서울 6,240 9,234"));
  assert.ok(!readableText("8˝0½ $ SNS 0À |tW SNS |tW SNSﬂ \\ Ä ìX ˘ﬂ| Õ<\\ `t„ 1¥Xﬂ"));
  assert.ok(!readableText("   \n "));
});

test("pickCategory takes the most-voted AI-named kind, earlier chunk on ties, empty without names", () => {
  assert.equal(pickCategory(["발표", " IR 피칭 ", "IR 피칭", null]), "IR 피칭");
  assert.equal(pickCategory(["창업 캠프", "해커톤"]), "창업 캠프");
  assert.equal(pickCategory([3, null, "  "]), "");
});

test("chatContext refers to questions by number, never by UUID", () => {
  const id = "3f2b8c1e-0d4a-4e6b-9a7c-1b2c3d4e5f60";
  const context = chatContext({ schemaVersion: 2, model: "m", category: "대학 강의", slides: [{ page: 1, topic: "도입", questionSummary: "", suggestion: "", metrics: { questions: 2, positioned: 0, unanswered: 2, answered: 0, resolved: 0, reactions: 0, answers: 0 } }],
    questions: [{ id: "a", page: 1, text: "첫 질문", answers: [], reactions: 0, status: "unanswered" }, { id, page: 1, text: "둘째 질문", answers: ["답"], reactions: 3, status: "answered" }],
    overall: { summary: "요약", hotspots: [], suggestions: [] }, groups: [{ title: "묶음", summary: "", questionIds: [id, "MISSING"] }] });
  assert.match(context, /질문 묶음 묶음: +\(질문 2\)/);
  assert.match(context, /슬라이드 1 질문:\n1\. 첫 질문\n2\. 둘째 질문 \[공감 3, answered\]\n  답변: 답/);
  assert.ok(!context.includes(id));
});

test("viewSlides sends requested slide images with their PINs in pixels and chat question numbers, skips image-only slides, refuses a changed deck", async () => {
  const dir = await mkdtemp(join(tmpdir(), "view-slides-")), file = join(dir, "page-3.jpg");
  await writeFile(file, "jpeg");
  const metrics = { questions: 0, positioned: 0, unanswered: 0, answered: 0, resolved: 0, reactions: 0, answers: 0 };
  const body = { schemaVersion: 2, model: "m", slides: [1, 2, 3].map((page) => ({ page, topic: "", questionSummary: "", suggestion: "", metrics })),
    questions: ["a", "b"].map((id) => ({ id, page: 3, text: id, answers: [], reactions: 0, status: "unanswered" })), overall: { summary: "", hotspots: [], suggestions: [] }, groups: [] } as Parameters<typeof viewSlides>[1];
  const material = { slides: [{ id: "s1", pageIndex: 0, sourcePageIndex: 0 }, { id: "s2", pageIndex: 1, sourcePageIndex: null }, { id: "s3", pageIndex: 2, sourcePageIndex: 2 }],
    questions: [{ id: "b", slideId: "s3", anchor: { kind: "point", x: 0.5, y: 0.25 } }, { id: "late", slideId: "s3", anchor: { kind: "point", x: 0.1, y: 0.1 } }, { id: "a", slideId: "s3", anchor: null }] } as unknown as Parameters<typeof viewSlides>[0];
  const asked: number[][] = [];
  const render = async (pages: number[]) => { asked.push(pages); return [{ page: 3, width: 1000, height: 500, file, text: "제목" }]; };
  const result = await viewSlides(material, body, render, { pages: [3, 2, 3, 9, "1"] }) as { type: string; text?: string }[];
  assert.deepEqual(asked, [[3]]);
  assert.deepEqual(result.map((block) => block.type), ["text", "image", "text", "text"]);
  assert.equal(result[0].text, "슬라이드 3 (이미지 1000x500px):");
  assert.match(result[2].text!, /<slide_text page="3">\n제목\n<\/slide_text>[\s\S]*질문 2: PIN \(500, 125\)px$/);
  assert.equal(result[3].text, "슬라이드 2는 PDF에 없는 이미지 슬라이드라 볼 수 없다.");
  assert.match(String(await viewSlides(material, { ...body, slides: body.slides.slice(0, 2) }, render, { pages: [1] })), /바뀌어/);
  await rm(dir, { recursive: true });
});

test("slidesMentioned attaches slides the instructor names, not question numbers", () => {
  assert.deepEqual(slidesMentioned("2페이지에서 질문이 몰린 부분이 어디야?", 5, 15), [2]);
  assert.deepEqual(slidesMentioned("3번 슬라이드랑 슬라이드 7, 12쪽 비교해줘", null, 15), [3, 7, 12]);
  assert.deepEqual(slidesMentioned("이 슬라이드에서 PIN이 어디 찍혔어?", 5, 15), [5]);
  assert.deepEqual(slidesMentioned("3번 질문은 무슨 뜻이야? 15%는?", 5, 15), []);
  assert.deepEqual(slidesMentioned("20페이지랑 1, 2, 3, 4번째 장", null, 15), [4]);
});
