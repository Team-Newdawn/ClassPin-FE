import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import type { Slide } from "../_model/types";

test("streamed preview inserts pages in order without mutating existing snapshots", () => {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync("app/_controller/use-slide-upload.ts", "utf8") + "\nexports.insertByPage = insertByPage;", {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  new Function("require", "exports", code)(() => ({}), exports);
  const insert = exports.insertByPage as (list: Slide[], slide: Slide) => Slide[];
  let slides: Slide[] = [];
  for (const [id, pageIndex] of [3, 1, 4, 1, 0, 2].entries()) {
    const previous = [...slides];
    const slide = { id: String(id), pageIndex, title: String(pageIndex), imageUrl: "" };
    const expected = [...slides, slide].sort((a, b) => a.pageIndex - b.pageIndex);
    const next = insert(slides, slide);
    assert.deepEqual(next, expected);
    assert.deepEqual(slides, previous);
    slides = next;
  }
});
