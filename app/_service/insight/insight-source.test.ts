import assert from "node:assert/strict";
import test from "node:test";
import { inspectInsightSource, parseInsightSelection } from "./insight-source.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture() {
  return [{ id: id(1), owner_id: "private-owner", lectures: [{ id: id(2), title: "강의", materials: [{
    id: id(3), file_name: "자료.pdf", material_versions: [{ id: id(4), version_no: 1, source_path: "owner/source.pdf", slides: [{
      id: id(5), material_version_id: id(4), page_index: 0, image_path: null, source_page_index: 0,
      slide_instructor_notes: { body: "private-note" },
    }] }],
  }], questions: [{ id: id(6), lecture_id: id(2), slide_id: id(5), raw_text: "무슨 의미인가요?", category: "question",
    status: "answered", reaction_count: 2, created_at: "2026-10-21T00:00:00Z", author_id: "private-author",
    region_anchors: [{ kind: "point", coords: { x: 0.5, y: 0.5 } }],
    answers: [{ body: "두 번째", created_at: "2026-10-21T00:02:00Z" }, { body: "첫 번째", created_at: "2026-10-21T00:01:00Z" }],
  }] }] }];
}

test("source projection preserves full answers and source pages, excludes identity/notes", () => {
  const graph = fixture(), result = inspectInsightSource(graph, [id(3)]);
  assert.deepEqual(result.counts, { materials: 1, slides: 1, questions: 1, answers: 2 });
  assert.deepEqual(result.materials[0].questions[0].answers.map((answer) => answer.body), ["첫 번째", "두 번째"]);
  assert.equal(result.materials[0].slides[0].sourcePageIndex, 0);
  assert.ok(!JSON.stringify(result).includes("private-"));
});

test("invalid selections and corrupt source references fail instead of becoming slide one", () => {
  for (const selection of [null, {}, { materialIds: [] }, { materialIds: [id(3), id(3)] }, { materialIds: ["invalid"] },
    { materialIds: [id(3)], ownerId: "attacker" }]) assert.throws(() => parseInsightSelection(selection));
  assert.throws(() => inspectInsightSource(fixture(), [id(30)]), /SOURCE_NOT_FOUND/);
  const graph = fixture();
  graph[0].lectures[0].questions[0].slide_id = id(100);
  assert.throws(() => inspectInsightSource(graph, [id(3)]), /ORPHAN_QUESTION/);
  const invalid = fixture();
  invalid[0].lectures[0].questions[0].region_anchors[0].coords.x = NaN;
  assert.throws(() => inspectInsightSource(invalid, [id(3)]));
  const wrongLecture = fixture();
  wrongLecture[0].lectures[0].questions[0].lecture_id = id(200);
  assert.throws(() => inspectInsightSource(wrongLecture, [id(3)]));
});
