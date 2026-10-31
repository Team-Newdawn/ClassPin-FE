import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, utimes } from "node:fs/promises";
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

test("만료 파일 청소 실패가 완성된 PDF 응답을 막지 않는다", async () => {
  const modulePath = "./pdf-cache.ts?cleanup";
  const { cachedFile: freshCache } = await import(modulePath);
  const dir = await mkdtemp(path.join(os.tmpdir(), "pdf-cleanup-test-"));
  try {
    const oldDirectory = path.join(dir, "old-directory");
    await mkdir(oldDirectory);
    const stale = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await utimes(oldDirectory, stale, stale);
    const file = await freshCache("source.pdf", async () => new Blob(["pdf"]).stream(), { dir });
    assert.equal(await readFile(file, "utf8"), "pdf");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("상한을 넘으면 가장 오래 안 쓴 파일부터 지우고, 방금 쓴 파일은 남긴다", async () => {
  const modulePath = "./pdf-cache.ts?cap";
  const { cachedFile: capped, findCachedFile } = await import(modulePath);
  const dir = await mkdtemp(path.join(os.tmpdir(), "pdf-cap-test-"));
  const bytes = (size: number) => async () => new Blob([new Uint8Array(size)]).stream();
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));
  try {
    const first = await capped("first.pdf", bytes(400), { dir, maxBytes: 1_000 });
    await settle();
    const second = await capped("second.pdf", bytes(400), { dir, maxBytes: 1_000 });
    await settle();
    // first is used again now, so second becomes the least recently used.
    const old = new Date(Date.now() - 60_000);
    await utimes(second, old, new Date());
    assert.equal(await findCachedFile("first.pdf", { dir }), first);
    await settle();
    // The 256 MiB trigger forces this sweep even though the first one ran under a minute ago.
    const third = await capped("third.pdf", bytes(256 * 1024 ** 2), { dir, maxBytes: 256 * 1024 ** 2 + 500 });
    await settle();
    assert.equal(await findCachedFile("second.pdf", { dir }), null, "least recently used file is removed");
    assert.equal(await findCachedFile("first.pdf", { dir }), first, "recently used file stays");
    assert.equal(await findCachedFile("third.pdf", { dir }), third, "the file just downloaded stays");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
