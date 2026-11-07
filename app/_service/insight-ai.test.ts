import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chatFile, pickCategory, reportChatContext, pointedSections, viewSlides, readableText, slidesMentioned, analyzeSlides, groupQuestions, reportBody, writeReportSections, chatReport, CHAT_FULL_DOCUMENT_CHARS, type InsightAi } from "./insight-ai.ts";
import { limiter } from "../_infrastructure/server/limiter.ts";
import type { ReportDocument } from "../_model/report.ts";
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
test("reportChatContext lists sections and only the source questions the document does not quote; a long document keeps only titles, and the named bodies go with the question", () => {
  const id = "3f2b8c1e-0d4a-4e6b-9a7c-1b2c3d4e5f60";
  const material = { slides: [{ id: "s1", pageIndex: 0 }, { id: "s2", pageIndex: 1 }],
    questions: [{ id, slideId: "s2", text: "둘째 질문", answers: [{ body: "답" }], reactions: 3, status: "answered" }, { id: "a", slideId: "s1", text: "첫 질문 a@b.co", answers: [], reactions: 0, status: "unanswered" }] } as unknown as Parameters<typeof reportChatContext>[1];
  const document: ReportDocument = { title: "리포트", metrics: metricsOf(2), sections: [{ id: "sec-a", title: "강의 개요", text: "개요 본문" }, { id: "sec-b", title: "슬라이드 2", text: "슬라이드 본문", slide: 2 }] };
  const context = reportChatContext(document, material);
  assert.match(context, /섹션 1: 강의 개요\n개요 본문/);
  assert.match(context, /섹션 2 \(슬라이드 2\): 슬라이드 2\n슬라이드 본문/);
  assert.match(context, /슬라이드 1 질문:\n- \[REDACTED\]\n슬라이드 2 질문:\n- 둘째 질문 \[공감 3, answered\]\n  답변: 답/);
  assert.ok(!context.includes(id));
  // A question the document already quotes as a whole line is not sent again; a mere substring ("둘째") does not count.
  const quoting: ReportDocument = { ...document, sections: [{ id: "sec-b", title: "슬라이드 2", text: "질문 1건 (공감순)\n- 둘째 질문 (공감 3)\n  답변: 답\n- 둘째", slide: 2 }] };
  const deduped = reportChatContext(quoting, material);
  assert.ok(!deduped.includes("슬라이드 2 질문:"));
  assert.match(deduped, /리포트 문서에 없는 원본 질문[^\n]*\n슬라이드 1 질문:\n- \[REDACTED\]$/);
  const all = { ...material, questions: material.questions.slice(0, 1) } as typeof material;
  assert.match(reportChatContext(quoting, all), /원본 질문은 모두 리포트 문서에 있다\.$/);
  const long: ReportDocument = { ...document, sections: [...document.sections, { id: "sec-c", title: "부록", text: "x".repeat(CHAT_FULL_DOCUMENT_CHARS) }] };
  // The cached context holds titles only, whatever the question; the bodies it points at go with the question.
  const trimmed = reportChatContext(long, material);
  assert.match(trimmed, /섹션 1: 강의 개요\n섹션 2 \(슬라이드 2\): 슬라이드 2\n섹션 3: 부록\n자료는 슬라이드 2장이다\. 리포트 문서에 없는 원본 질문/);
  assert.equal(pointedSections(long, "2번 슬라이드 섹션을 다듬어 줘", null), "(이 질문이 가리킨 섹션 본문)\n섹션 2 (슬라이드 2): 슬라이드 2\n슬라이드 본문");
  assert.match(pointedSections(long, "섹션 3 줄여 줘", null), /^\(이 질문이 가리킨 섹션 본문\)\n섹션 3: 부록\nxxx/);
  assert.equal(pointedSections(long, "요약해 줘", null), "");
  assert.equal(pointedSections(document, "섹션 1 줄여 줘", null), "");
});

test("viewSlides sends requested slide images (PDF and image slides) with each PIN's pixel position and question text, refuses a changed deck", async () => {
  const dir = await mkdtemp(join(tmpdir(), "view-slides-")), file = join(dir, "page-3.jpg");
  await writeFile(file, "jpeg");
  const material = { slides: [{ id: "s1", pageIndex: 0, sourcePageIndex: 0 }, { id: "s2", pageIndex: 1, sourcePageIndex: null }, { id: "s3", pageIndex: 2, sourcePageIndex: 2 }],
    questions: [{ id: "b", slideId: "s3", text: "이 숫자는?", anchor: { kind: "point", x: 0.5, y: 0.25 } }, { id: "late", slideId: "s3", text: "메일 a@b.co", anchor: { kind: "point", x: 0.1, y: 0.1 } }, { id: "a", slideId: "s3", text: "위치 없음", anchor: null }] } as unknown as Parameters<typeof viewSlides>[0];
  const asked: number[][] = [];
  const render = async (pages: number[]) => { asked.push(pages); return [{ page: 3, width: 1000, height: 500, file, text: "제목" }, { page: 2, width: 800, height: 600, file, text: "" }]; };
  const result = await viewSlides(material, 3, render, { pages: [3, 2, 3, 9, "1"] }) as { type: string; text?: string }[];
  assert.deepEqual(asked, [[3, 2]]);
  assert.deepEqual(result.map((block) => block.type), ["text", "image", "text", "text", "image", "text"]);
  assert.equal(result[0].text, "슬라이드 3 (이미지 1000x500px):");
  assert.match(result[2].text!, /<slide_text page="3">\n제목\n<\/slide_text>[\s\S]*- PIN \(500, 125\)px: 이 숫자는\?\n- PIN \(100, 50\)px: \[REDACTED\]$/);
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
  const material = { slides, questions } as unknown as Parameters<typeof analyzeSlides>[2];
  const source = { evidence: slides.map((slide) => ({ slideId: slide.id, metrics: { questions: questions.filter((q) => q.slideId === slide.id).length } })) } as unknown as Parameters<typeof analyzeSlides>[1];
  const issue = (title: string, refs: unknown) => ({ title, summary: "표의 비교 기준을 묻습니다.", questions: refs });
  const fake: InsightAi = {
    name: "fake", model: () => "fake", configured: () => true, imageEdge: () => 100,
    async json({ schema, content }) {
      if (!JSON.stringify(schema).includes("category")) return { sections: [{ title: "심사 관점 점검", text: "| 항목 | 자료 |\n|---|---|\n| 시장 | 보완 필요 |" }, { title: "", text: "제목 없음" }], groups: [] };
      const prompt = content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n");
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
  // RPT-121/122: the shared slide analysis reports chunk progress; the report's body sections are a separate call on top of it.
  const seen: unknown[] = [];
  const shared = { ...await analyzeSlides(fake, source, material, [], "", undefined, (done, total) => seen.push({ done, total })), groups: [] };
  assert.deepEqual(seen, [{ done: 3, total: 3 }]);
  const base = reportBody(fake, material, shared, "");
  assert.deepEqual(base.sections, []);
  const body = { ...base, sections: await writeReportSections(fake, base) };
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
  const material = { slides, questions } as unknown as Parameters<typeof analyzeSlides>[2];
  const metrics = (questions: number) => ({ questions, positioned: questions, unanswered: questions, answered: 0, resolved: 0, reactions: 0, answers: 0 });
  const source = { evidence: slides.map((slide) => ({ slideId: slide.id, metrics: metrics(slide.id === "s21" ? 1 : 0) })) } as unknown as Parameters<typeof analyzeSlides>[1];
  const seen: { tools?: string[]; last?: unknown; toolResult?: unknown; other?: unknown } = {};
  const fake: InsightAi = {
    name: "fake", model: () => "fake-1", configured: () => true, imageEdge: () => 100,
    async json({ schema, content, onUsage }) {
      onUsage({ input: 1, cacheRead: 0, cacheWrite: 0, output: 1, overTier: false });
      if (!JSON.stringify(schema).includes("category")) return { sections: [], groups: [{ title: "표", summary: "", questions: [1] }] };
      // Pages 1-20 come in four 5-page chunks that fail; page 21 is a chunk of its own.
      if (content.filter((part) => part.type === "image").length === 5) throw new Error("AI_TRUNCATED");
      // SB-2: instructions first, then the slide's label, image and its own questions right after the image.
      assert.deepEqual(content.map((part) => part.type), ["text", "text", "image", "text"]);
      assert.match((content[0] as { text: string }).text, /^아래에 슬라이드마다 원본 이미지/);
      assert.match((content[3] as { text: string }).text, /^슬라이드 21 질문: \n질문 1 - PIN \(50, 25\)px: 표 질문$/);
      return { category: "강의", slides: [{ page: 21, topic: "표", content: "", questionSummary: "표 질문 요약", suggestion: "" }] };
    },
    async* chat({ messages, tools, runTool }) {
      seen.tools = tools.map((tool) => tool.name); seen.last = messages.at(-1); seen.toolResult = await runTool("view_slides", { pages: [21] });
      seen.other = await runTool("propose_document", { replace: [] });
      yield "답";
    },
  };
  const log = console.info;
  console.info = () => {};
  try {
    const shared = { ...await analyzeSlides(fake, source, material, images, "", undefined), groups: await groupQuestions(fake, [{ id: "q1", text: "표 질문", page: 21 }]) };
    const body = reportBody(fake, material, shared, "");
    assert.deepEqual([body.provider, body.model, body.failedPages?.length, body.slides[20].questionSummary, body.slides[20].slideId, body.groups[0].questionIds], ["fake", "fake-1", 20, "표 질문 요약", "s21", ["q1"]]);
    const view = async (input: unknown) => viewSlides(material, 21, async (pages) => images.filter((image) => pages.includes(image.page)), input);
    const document: ReportDocument = { title: "리포트", metrics: metricsOf(21), sections: [{ id: "sec-a", title: "강의 개요", text: "본문" }] };
    let answer = "";
    for await (const delta of chatReport(fake, { document, material, history: [], message: "21번 슬라이드 봐줘", currentPage: null, view, withData: true, file: null })) answer += delta;
    assert.equal(answer, "답");
    // RPT-050: answers only; the chat has no tool that edits the document.
    assert.deepEqual(seen.tools, ["view_slides"]);
    assert.equal(seen.other, "알 수 없는 도구다.");
    assert.deepEqual((seen.last as { content: { type: string }[] }).content.map((part) => part.type), ["text", "image", "text", "text"]);
    assert.equal((seen.toolResult as { type: string }[])[1].type, "image");
    // RPT-057/058: without source data no slide is attached or viewable, and the attachment rides along this question only.
    const file = chatFile({ name: "메모.md", data: Buffer.from("핵심 메모").toString("base64") });
    for await (const delta of chatReport(fake, { document, material, history: [{ role: "user", text: "이전", createdAt: "t", file: "예전.pdf" }], message: "21번 슬라이드 봐줘",
      currentPage: null, view, withData: false, file })) void delta;
    assert.deepEqual(seen.tools, []);
    assert.equal(seen.toolResult, "알 수 없는 도구다.");
    const last = (seen.last as { content: { type: string; text?: string }[] }).content;
    assert.deepEqual(last.map((part) => part.type), ["text", "text", "text"]);
    assert.match(String(last[1].text), /<attached_file name="메모.md">\n핵심 메모/);
  } finally { console.info = log; await rm(dir, { recursive: true }); }
});

test("chatFile types an attachment by its bytes and refuses anything else", () => {
  const b64 = (bytes: number[] | string) => (typeof bytes === "string" ? Buffer.from(bytes) : Buffer.from(bytes)).toString("base64");
  assert.equal(chatFile(undefined), null);
  assert.equal(chatFile({ name: "a.pdf", data: b64("%PDF-1.7") })!.parts[1].type, "pdf");
  assert.deepEqual(chatFile({ name: "a.png", data: b64([0x89, 0x50, 0x4e, 0x47, 1]) })!.parts[1], { type: "image", data: b64([0x89, 0x50, 0x4e, 0x47, 1]), png: true });
  assert.equal(chatFile({ name: "a.jpg", data: b64([0xff, 0xd8, 0xff, 0]) })!.parts[1].type, "image");
  // A renamed binary is not text, whatever its name says.
  assert.throws(() => chatFile({ name: "a.txt", data: b64([0xc3, 0x28]) }), /INVALID_FILE/);
  assert.throws(() => chatFile({ name: "", data: b64("x") }), /INVALID_FILE/);
  assert.throws(() => chatFile({ name: "big.txt", data: Buffer.alloc(10 * 1024 * 1024 + 1, 97).toString("base64") }), /FILE_TOO_LARGE/);
  assert.throws(() => chatFile({ name: "big.png", data: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(5 * 1024 * 1024)]).toString("base64") }), /FILE_TOO_LARGE/);
  const long = chatFile({ name: "<a>.txt", data: b64("가".repeat(50_001)) })!;
  assert.equal(long.name, "a.txt");
  assert.match(String((long.parts[1] as { text: string }).text), /앞 50000자만/);
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
  const material = { slides, questions: [] } as unknown as Parameters<typeof analyzeSlides>[2];
  const source = { evidence: slides.map((slide) => ({ slideId: slide.id, metrics: { questions: 0 } })) } as unknown as Parameters<typeof analyzeSlides>[1];
  const asked: string[][] = [];
  const fake: InsightAi = {
    name: "fake", model: () => "fake", configured: () => true, imageEdge: () => 100,
    async json({ schema, content }) {
      if (!JSON.stringify(schema).includes("category")) return { sections: [], groups: [] };
      const pages = [...content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n").matchAll(/^슬라이드 (\d+)\b.*질문 없음$/gm)].map((match) => match[1]);
      asked.push(pages);
      return asked.length === 1
        ? { slides: [{ page: 1, topic: "표지", content: "표지 내용" }, { page: 2, topic: "본론", content: "" }, { page: 3, topic: "요약", content: " " }] }
        : { slides: [{ page: 2, topic: "본론", content: "본론 내용" }, { page: 1, content: "덮어쓰면 안 됨" }] };
    },
    async* chat() { yield ""; },
  };
  const body = await analyzeSlides(fake, source, material, [], "");
  assert.deepEqual(asked, [["1", "2", "3"], ["2", "3"]]);
  assert.deepEqual(body.slides.map((slide) => [slide.topic, slide.content]), [["표지", "표지 내용"], ["본론", "본론 내용"], ["요약", ""]]);
});
