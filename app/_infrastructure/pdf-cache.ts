import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const DEFAULT_DIR = path.join(os.tmpdir(), "ohpin-pdf-cache");
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const inflight = new Map<string, Promise<string>>();

/**
 * key 에 해당하는 파일을 서버 디스크에 한 번만 받아 그 경로를 돌려준다.
 *
 * 수업 시작 직후 수십 명이 동시에 들어와도 같은 key 의 다운로드는 하나만 실행하고 나머지는 그 결과를
 * 기다린다. 원본 경로는 UUID 라 바뀌지 않으므로 신선도는 mtime 으로만 본다.
 * ponytail: 청소는 새 파일을 받을 때 같은 폴더의 오래된 파일을 지우는 정도다. 디스크가 문제되면 LRU 상한을 둔다.
 */
export async function cachedFile(
  key: string,
  fetchStream: () => Promise<ReadableStream>,
  { dir = DEFAULT_DIR, maxAgeMs = DEFAULT_MAX_AGE_MS } = {},
): Promise<string> {
  const file = path.join(dir, createHash("sha1").update(key).digest("hex"));
  const info = await stat(file).catch(() => null);
  if (info && Date.now() - info.mtimeMs < maxAgeMs) return file;
  let pending = inflight.get(file);
  if (!pending) {
    pending = (async () => {
      await mkdir(dir, { recursive: true });
      const part = `${file}.${process.pid}.part`;
      try {
        await pipeline(Readable.fromWeb(await fetchStream() as import("node:stream/web").ReadableStream), createWriteStream(part));
        await rename(part, file);
      } catch (error) {
        await rm(part, { force: true });
        throw error;
      }
      await sweep(dir, maxAgeMs, file);
      return file;
    })().finally(() => inflight.delete(file));
    inflight.set(file, pending);
  }
  return pending;
}

async function sweep(dir: string, maxAgeMs: number, keep: string) {
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    const candidate = path.join(dir, name);
    if (candidate === keep || name.endsWith(".part")) continue;
    const info = await stat(candidate).catch(() => null);
    if (info && Date.now() - info.mtimeMs >= maxAgeMs) await rm(candidate, { force: true });
  }
}
