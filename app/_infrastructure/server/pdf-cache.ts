import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat, utimes } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const DEFAULT_DIR = path.join(os.tmpdir(), "ohpin-pdf-cache");
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** The cache shares the server disk with every other service, so it stays under 3 GiB. */
const DEFAULT_MAX_BYTES = 3 * 1024 ** 3;
// ponytail: cleanup runs once a minute or after 256 MiB of new files, so the cache can briefly pass the cap by that much.
const SWEEP_AFTER_BYTES = 256 * 1024 ** 2;
const inflight = new Map<string, Promise<string>>();

/**
 * key 에 해당하는 파일을 서버 디스크에 한 번만 받아 그 경로를 돌려준다.
 *
 * 수업 시작 직후 수십 명이 동시에 들어와도 같은 key 의 다운로드는 하나만 실행하고 나머지는 그 결과를
 * 기다린다. 원본 경로는 UUID 라 바뀌지 않으므로 신선도는 mtime 으로만 본다.
 * 받은 지 하루가 지난 파일은 지우고, 폴더가 상한을 넘으면 가장 오래 안 쓴 파일부터 지운다.
 * mtime 은 받은 시각(만료 기준), atime 은 마지막 사용 시각(상한 기준)이다. 쓸 때마다 atime 을 직접 갱신한다.
 */
export async function findCachedFile(
  key: string,
  { dir = DEFAULT_DIR, maxAgeMs = DEFAULT_MAX_AGE_MS } = {},
): Promise<string | null> {
  const file = path.join(dir, createHash("sha1").update(key).digest("hex"));
  const info = await stat(file).catch(() => null);
  if (!info || Date.now() - info.mtimeMs >= maxAgeMs) return null;
  void utimes(file, new Date(), info.mtime).catch(() => {});
  return file;
}

export async function cachedFile(
  key: string,
  fetchStream: () => Promise<ReadableStream>,
  { dir = DEFAULT_DIR, maxAgeMs = DEFAULT_MAX_AGE_MS, maxBytes = DEFAULT_MAX_BYTES } = {},
): Promise<string> {
  const cached = await findCachedFile(key, { dir, maxAgeMs });
  if (cached) return cached;
  const file = path.join(dir, createHash("sha1").update(key).digest("hex"));
  let pending = inflight.get(file);
  if (!pending) {
    pending = (async () => {
      await mkdir(dir, { recursive: true });
      const part = `${file}.${process.pid}.part`;
      try {
        await pipeline(Readable.fromWeb(await fetchStream() as import("node:stream/web").ReadableStream), createWriteStream(part));
        await rename(part, file);
        unsweptBytes += (await stat(file)).size;
      } catch (error) {
        await rm(part, { force: true });
        throw error;
      }
      // 청소가 첫 화면을 막거나 구간 요청마다 디스크 전체를 훑지 않도록 한다.
      if (Date.now() >= nextSweepAt || unsweptBytes >= SWEEP_AFTER_BYTES) {
        nextSweepAt = Date.now() + 60_000;
        unsweptBytes = 0;
        void sweep(dir, maxAgeMs, maxBytes, file).catch(() => {});
      }
      return file;
    })().finally(() => inflight.delete(file));
    inflight.set(file, pending);
  }
  return pending;
}

let nextSweepAt = 0, unsweptBytes = 0;

async function sweep(dir: string, maxAgeMs: number, maxBytes: number, keep: string) {
  const files: { file: string; size: number; usedAt: number }[] = [];
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    const candidate = path.join(dir, name);
    if (candidate === keep || name.endsWith(".part")) continue;
    const info = await stat(candidate).catch(() => null);
    if (!info) continue;
    if (Date.now() - info.mtimeMs >= maxAgeMs) await rm(candidate, { force: true });
    else files.push({ file: candidate, size: info.size, usedAt: info.atimeMs });
  }
  const keepSize = (await stat(keep).catch(() => null))?.size ?? 0;
  let total = keepSize + files.reduce((sum, item) => sum + item.size, 0);
  // Least recently used first; an open reader keeps its descriptor even after the file is removed.
  for (const item of files.sort((a, b) => a.usedAt - b.usedAt)) {
    if (total <= maxBytes) break;
    await rm(item.file, { force: true });
    total -= item.size;
  }
}
