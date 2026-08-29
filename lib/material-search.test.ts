import assert from "node:assert/strict";
import test from "node:test";
import { buildMaterialSearchIndex, searchMaterialIndex } from "./material-search.ts";

const materials = [
  { id: "react", title: "React 성능 최적화", fileName: "react-performance.pdf" },
  { id: "korean", title: "한글 검색 입문", fileName: "search-guide.pptx" },
  { id: "database", title: "대용량 데이터베이스", fileName: "database-index.pdf" }
];

test("제목과 파일명의 키워드 prefix를 대소문자와 전각 문자에 관계없이 찾는다", () => {
  const index = buildMaterialSearchIndex(materials);

  assert.deepEqual(searchMaterialIndex(index, "ＲＥＡ per").map((material) => material.id), ["react"]);
  assert.deepEqual(searchMaterialIndex(index, "한글 입").map((material) => material.id), ["korean"]);
  assert.deepEqual(searchMaterialIndex(index, "data ind").map((material) => material.id), ["database"]);
});

test("여러 키워드는 AND로 결합하고 원래 자료 순서를 유지한다", () => {
  const index = buildMaterialSearchIndex([
    ...materials,
    { id: "react-db", title: "React 데이터베이스", fileName: "database-react.pdf" }
  ]);

  assert.deepEqual(searchMaterialIndex(index, "react data").map((material) => material.id), ["react-db"]);
  assert.deepEqual(searchMaterialIndex(index, "pdf").map((material) => material.id), ["react", "database", "react-db"]);
});

test("빈 검색은 전체 자료를 반환하고 없는 키워드는 빈 결과를 반환한다", () => {
  const index = buildMaterialSearchIndex(materials);

  assert.deepEqual(searchMaterialIndex(index, "  ").map((material) => material.id), materials.map((material) => material.id));
  assert.deepEqual(searchMaterialIndex(index, "missing"), []);
});
