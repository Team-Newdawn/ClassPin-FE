import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, utimes } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { cachedFile } from "./pdf-cache.ts";

test("같은 key 의 동시 요청은 한 번만 받고, 신선한 캐시는 재사용하며, 오래된 캐시는 다시 받는다", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pdf-cache-test-"));
  let fetches = 0;
  const source = () => {
    fetches += 1;
    return Promise.resolve(new Blob([`pdf-${fetches}`]).stream());
  };
  try {
    const [first, second] = await Promise.all([cachedFile("a/b/source.pdf", source, { dir }), cachedFile("a/b/source.pdf", source, { dir })]);
    assert.equal(first, second);
    assert.equal(fetches, 1);
    assert.equal(await readFile(first, "utf8"), "pdf-1");

    assert.equal(await cachedFile("a/b/source.pdf", source, { dir }), first);
    assert.equal(fetches, 1);

    const stale = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await utimes(first, stale, stale);
    assert.equal(await cachedFile("a/b/source.pdf", source, { dir }), first);
    assert.equal(fetches, 2);
    assert.equal(await readFile(first, "utf8"), "pdf-2");

    await assert.rejects(cachedFile("c/d/source.pdf", () => Promise.reject(new Error("denied")), { dir }), /denied/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
