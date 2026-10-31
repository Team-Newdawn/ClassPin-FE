import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pickCategory, reportChatContext, viewSlides, readableText, slidesMentioned, analyzeInsight, chatReport, CHAT_FULL_DOCUMENT_CHARS, type InsightAi } from "./insight-ai.ts";
import { limiter } from "../_infrastructure/server/limiter.ts";
import type { ReportDocument, ReportProposal } from "../_model/report.ts";
import { slideImageEdge } from "./insight-providers/claude.ts";

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

const metricsOf = (slides: number) => ({ at: "", slides, questions: 0, pins: 0, reactions: 0, durationMinutes: null, audience: null, peakAudience: null });
test("reportChatContext lists sections with ids and source questions by number; a long document keeps only titles and the named bodies", () => {
  const id = "3f2b8c1e-0d4a-4e6b-9a7c-1b2c3d4e5f60";
  const material = { slides: [{ id: "s1", pageIndex: 0 }, { id: "s2", pageIndex: 1 }],
    questions: [{ id, slideId: "s2", text: "둘째 질문", answers: [{ body: "답" }], reactions: 3, status: "answered" }, { id: "a", slideId: "s1", text: "첫 질문 a@b.co", answers: [], reactions: 0, status: "unanswered" }] } as unknown as Parameters<typeof reportChatContext>[1];
  const document: ReportDocument = { title: "리포트", metrics: metricsOf(2), sections: [{ id: "sec-a", title: "강의 개요", text: "개요 본문" }, { id: "sec-b", title: "슬라이드 2", text: "슬라이드 본문", slide: 2 }] };
  const context = reportChatContext(document, material, "요약해 줘", null);
  assert.match(context, /섹션 1 \[id=sec-a\]: 강의 개요\n개요 본문/);
  assert.match(context, /섹션 2 \[id=sec-b\] \(슬라이드 2\): 슬라이드 2\n슬라이드 본문/);
  assert.match(context, /슬라이드 1 질문:\n1\. \[REDACTED\]\n슬라이드 2 질문:\n2\. 둘째 질문 \[공감 3, answered\]\n  답변: 답/);
  assert.ok(!context.includes(id));
  const long: ReportDocument = { ...document, sections: [...document.sections, { id: "sec-c", title: "부록", text: "x".repeat(CHAT_FULL_DOCUMENT_CHARS) }] };
  const trimmed = reportChatContext(long, material, "2번 슬라이드 섹션을 다듬어 줘", null);
  assert.match(trimmed, /섹션 1 \[id=sec-a\]: 강의 개요\n섹션 2/);
  assert.match(trimmed, /슬라이드 2\n슬라이드 본문/);
  assert.match(trimmed, /섹션 3 \[id=sec-c\]: 부록\n원본 질문/);
  assert.match(reportChatContext(long, material, "섹션 3 줄여 줘", null), /부록\nxxx/);
});

test("viewSlides sends requested slide images (PDF and image slides) with their PINs in pixels and chat question numbers, refuses a changed deck", async () => {
  const dir = await mkdtemp(join(tmpdir(), "view-slides-")), file = join(dir, "page-3.jpg");
  await writeFile(file, "jpeg");
  const material = { slides: [{ id: "s1", pageIndex: 0, sourcePageIndex: 0 }, { id: "s2", pageIndex: 1, sourcePageIndex: null }, { id: "s3", pageIndex: 2, sourcePageIndex: 2 }],
    questions: [{ id: "b", slideId: "s3", anchor: { kind: "point", x: 0.5, y: 0.25 } }, { id: "late", slideId: "s3", anchor: { kind: "point", x: 0.1, y: 0.1 } }, { id: "a", slideId: "s3", anchor: null }] } as unknown as Parameters<typeof viewSlides>[0];
  const asked: number[][] = [];
  const render = async (pages: number[]) => { asked.push(pages); return [{ page: 3, width: 1000, height: 500, file, text: "제목" }, { page: 2, width: 800, height: 600, file, text: "" }]; };
  const result = await viewSlides(material, 3, render, { pages: [3, 2, 3, 9, "1"] }) as { type: string; text?: string }[];
  assert.deepEqual(asked, [[3, 2]]);
  assert.deepEqual(result.map((block) => block.type), ["text", "image", "text", "text", "image", "text"]);
  assert.equal(result[0].text, "슬라이드 3 (이미지 1000x500px):");
  assert.match(result[2].text!, /<slide_text page="3">\n제목\n<\/slide_text>[\s\S]*질문 1: PIN \(500, 125\)px\n질문 2: PIN \(100, 50\)px$/);
  assert.equal(result[3].text, "슬라이드 2 (이미지 800x600px):");
  assert.equal(result[5].text, "이 슬라이드에는 위치가 있는 PIN이 없다.");
  assert.match(String(await viewSlides(material, 2, render, { pages: [1] })), /바뀌어/);
  await rm(dir, { recursive: true });
});

test("slidesMentioned attaches slides the instructor names, not question numbers", () => {
  assert.deepEqual(slidesMentioned("2페이지에서 질문이 몰린 부분이 어디야?", 5, 15), [2]);
  assert.deepEqual(slidesMentioned("3번 슬라이드랑 슬라이드 7, 12쪽 비교해줘", null, 15), [3, 7, 12]);
  assert.deepEqual(slidesMentioned("이 슬라이드에서 PIN이 어디 찍혔어?", 5, 15), [5]);
  assert.deepEqual(slidesMentioned("3번 질문은 무슨 뜻이야? 15%는?", 5, 15), []);
  assert.deepEqual(slidesMentioned("20페이지랑 1, 2, 3, 4번째 장", null, 15), [4]);
});

test("limiter never runs more than n tasks at once, keeps results in order, and a failure frees its slot", async () => {
  const slot = limiter(2);
  let running = 0, peak = 0;
  const results = await Promise.allSettled([1, 2, 3, 4, 5].map((n) => slot(async () => {
    running++; peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running--;
    if (n === 2) throw new Error("boom");
    return n;
  })));
  assert.equal(peak, 2);
  assert.deepEqual(results.map((r) => r.status === "fulfilled" ? r.value : "x"), [1, "x", 3, 4, 5]);
});

test("slide issues keep same-slide evidence, reject invalid references, and never invent reactions for slides without questions", async () => {
  const slides = [1, 2, 3].map((page) => ({ id: `s${page}`, pageIndex: page - 1 }));
  const questions = [1, 2, 3].map((n) => ({ id: `q${n}`, slideId: n < 3 ? "s1" : "s2", text: `질문 본문 ${n}`, answers: [], reactions: 0, status: "unanswered", anchor: null }));
  const material = { slides, questions } as unknown as Parameters<typeof analyzeInsight>[2];
  const source = { evidence: slides.map((slide) => ({ slideId: slide.id, metrics: { questions: questions.filter((q) => q.slideId === slide.id).length } })) } as unknown as Parameters<typeof analyzeInsight>[1];
  const issue = (title: string, refs: unknown) => ({ title, summary: "표의 비교 기준을 묻습니다.", questions: refs });
  const fake: InsightAi = {
    name: "fake", model: () => "fake", configured: () => true, imageEdge: () => 100,
    async json({ schema, content }) {
      if (!JSON.stringify(schema).includes("category")) return { sections: [{ title: "심사 관점 점검", text: "| 항목 | 자료 |\n|---|---|\n| 시장 | 보완 필요 |" }, { title: "", text: "제목 없음" }], groups: [] };
      const prompt = (content.at(-1) as { text: string }).text;
      assert.match(prompt, /질문 1 - 질문 본문 1/);
      assert.match(prompt, /질문 3 - 질문 본문 3/);
      assert.match(prompt, /미답변·답변 유무를 문제·우선순위·추가 확인 과제의 근거로 쓰지 않는다/);
      return { slides: [
        { page: 1, questionSummary: "핵심과 청중 반응", suggestion: "비교표에 기준을 추가합니다.", issues: [
          issue("비교 기준", [1, 1, 2]), issue("다른 슬라이드", [1, 3]), issue("없는 질문", [9]),
          issue("문자열 번호", ["1"]), issue("빈 참조", []), issue("잘못된 참조", null), issue("", [1]), null,
        ] },
        { page: 2, issues: [1, 2, 3, 4].map((n) => issue(`쟁점 ${n}`, [3])) },
        { page: 3, content: "자료 내용", questionSummary: "근거 없는 반응", suggestion: "근거 없는 제안", issues: [issue("근거 없는 쟁점", [1])] },
      ] };
    },
    async* chat() { yield ""; },
  };
  const body = await analyzeInsight(fake, source, material, [], "");
  assert.deepEqual(body.slides[0].issues, [{ title: "비교 기준", summary: "표의 비교 기준을 묻습니다.", questionIds: ["q1", "q2"] }]);
  assert.equal(body.slides[0].questionSummary, "핵심과 청중 반응");
  // RPT-035: the AI-chosen sections pass through; a section without a title is dropped.
  assert.deepEqual(body.sections, [{ title: "심사 관점 점검", text: "| 항목 | 자료 |\n|---|---|\n| 시장 | 보완 필요 |" }]);
  assert.equal(body.slides[1].issues?.length, 3);
  assert.deepEqual([body.slides[2].content, body.slides[2].questionSummary, body.slides[2].suggestion, body.slides[2].issues], ["자료 내용", "", "", []]);
});

test("analysis and chat drive any provider through the adapter contract: one failed chunk only empties its slides, chat gets attachments and the tool", async () => {
  const dir = await mkdtemp(join(tmpdir(), "insight-ai-"));
  const images = await Promise.all(Array.from({ length: 21 }, async (_, i) => {
    const file = join(dir, `page-${i + 1}.jpg`);
    await writeFile(file, "jpeg");
    return { page: i + 1, width: 100, height: 50, file, text: "" };
  }));
  const slides = images.map((_, i) => ({ id: `s${i + 1}`, pageIndex: i, sourcePageIndex: i }));
  const questions = [{ id: "q1", slideId: "s21", text: "표 질문", answers: [], reactions: 0, status: "unanswered", anchor: { kind: "point", x: 0.5, y: 0.5 } }];
  const material = { slides, questions } as unknown as Parameters<typeof analyzeInsight>[2];
  const metrics = (questions: number) => ({ questions, positioned: questions, unanswered: questions, answered: 0, resolved: 0, reactions: 0, answers: 0 });
  const source = { evidence: slides.map((slide) => ({ slideId: slide.id, metrics: metrics(slide.id === "s21" ? 1 : 0) })) } as unknown as Parameters<typeof analyzeInsight>[1];
  const seen: { tools?: string[]; last?: unknown; toolResult?: unknown; retry?: unknown } = {};
  const fake: InsightAi = {
    name: "fake", model: () => "fake-1", configured: () => true, imageEdge: () => 100,
    async json({ schema, content, onUsage }) {
      onUsage({ input: 1, cacheRead: 0, cacheWrite: 0, output: 1, overTier: false });
      if (!JSON.stringify(schema).includes("category")) return { sections: [], groups: [{ title: "표", summary: "", questions: [1] }] };
      if (content.filter((part) => part.type === "image").length === 20) throw new Error("AI_TRUNCATED");
      assert.match((content.at(-1) as { text: string }).text, /PIN \(50, 25\)px: 표 질문/);
      return { category: "강의", slides: [{ page: 21, topic: "표", content: "", questionSummary: "표 질문 요약", suggestion: "" }] };
    },
    async* chat({ messages, tools, runTool }) {
      seen.tools = tools.map((tool) => tool.name); seen.last = messages.at(-1); seen.toolResult = await runTool("view_slides", { pages: [21] });
      seen.retry = await runTool("propose_document", { replace: [{ id: "missing", title: "t", text: "x" }], insert: [], remove: [] });
      await runTool("propose_document", { replace: [{ id: "sec-a", title: "개요", text: "새 본문" }], insert: [{ after: null, title: "머리말", text: "안녕", slide: null }], remove: [] });
      yield "답";
    },
  };
  const log = console.info;
  console.info = () => {};
  try {
    const body = await analyzeInsight(fake, source, material, images, "", undefined);
    assert.deepEqual([body.provider, body.model, body.failedPages?.length, body.slides[20].questionSummary, body.groups[0].questionIds], ["fake", "fake-1", 20, "표 질문 요약", ["q1"]]);
    const view = async (input: unknown) => viewSlides(material, 21, async (pages) => images.filter((image) => pages.includes(image.page)), input);
    const document: ReportDocument = { title: "리포트", metrics: metricsOf(21), sections: [{ id: "sec-a", title: "강의 개요", text: "본문" }] };
    let answer = "", proposal: ReportProposal | undefined;
    for await (const delta of chatReport(fake, { document, material, history: [], message: "21번 슬라이드 봐줘", currentPage: null, view, onProposal: (value) => { proposal = value; } })) answer += delta;
    assert.equal(answer, "답");
    assert.deepEqual(seen.tools, ["view_slides", "propose_document"]);
    assert.match(String(seen.retry), /올바르지 않다/);
    assert.deepEqual(proposal, { replace: [{ id: "sec-a", title: "개요", text: "새 본문" }], insert: [{ after: null, title: "머리말", text: "안녕" }], remove: [] });
    assert.deepEqual((seen.last as { content: { type: string }[] }).content.map((part) => part.type), ["text", "image", "text", "text"]);
    assert.equal((seen.toolResult as { type: string }[])[1].type, "image");
  } finally { console.info = log; await rm(dir, { recursive: true }); }
});

test("one chat answer views at most 6 slides, even when tool calls run in parallel", async () => {
  const material = { slides: Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, pageIndex: i, sourcePageIndex: i })), questions: [] } as unknown as Parameters<typeof viewSlides>[0];
  const rendered: number[] = [];
  const render = async (pages: number[]) => { rendered.push(...pages); return []; };
  const budget = { left: 6 };
  await Promise.all([[1, 2, 3], [4, 5, 6], [7, 8, 9]].map((pages) => viewSlides(material, 10, render, { pages }, budget)));
  assert.deepEqual(rendered.sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
  assert.match(String(await viewSlides(material, 10, render, { pages: [10] }, budget)), /6장을 모두 봤다/);
});

test("question-free slides the model left without content are asked again once, alone", async () => {
  const slides = [1, 2, 3].map((page) => ({ id: `s${page}`, pageIndex: page - 1 }));
  const material = { slides, questions: [] } as unknown as Parameters<typeof analyzeInsight>[2];
  const source = { evidence: slides.map((slide) => ({ slideId: slide.id, metrics: { questions: 0 } })) } as unknown as Parameters<typeof analyzeInsight>[1];
  const asked: string[][] = [];
  const fake: InsightAi = {
    name: "fake", model: () => "fake", configured: () => true, imageEdge: () => 100,
    async json({ schema, content }) {
      if (!JSON.stringify(schema).includes("category")) return { sections: [], groups: [] };
      const pages = [...(content.at(-1) as { text: string }).text.matchAll(/^슬라이드 (\d+)\b.*질문 없음$/gm)].map((match) => match[1]);
      asked.push(pages);
      return asked.length === 1
        ? { slides: [{ page: 1, topic: "표지", content: "표지 내용" }, { page: 2, topic: "본론", content: "" }, { page: 3, topic: "요약", content: " " }] }
        : { slides: [{ page: 2, topic: "본론", content: "본론 내용" }, { page: 1, content: "덮어쓰면 안 됨" }] };
    },
    async* chat() { yield ""; },
  };
  const body = await analyzeInsight(fake, source, material, [], "");
  assert.deepEqual(asked, [["1", "2", "3"], ["2", "3"]]);
  assert.deepEqual(body.slides.map((slide) => [slide.topic, slide.content]), [["표지", "표지 내용"], ["본론", "본론 내용"], ["요약", ""]]);
});
