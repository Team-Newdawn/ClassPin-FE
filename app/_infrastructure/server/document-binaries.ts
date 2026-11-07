import "server-only";

import { execFile } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const PROBE_TIMEOUT_MS = 20_000;

type DocumentBinary = "pdftoppm" | "soffice";

const resolved = new Map<DocumentBinary, Promise<string>>();
/**
 * 강의 자료와 피드백 PDF가 같은 배포·개발 런타임 바이너리를 사용하게 한다. 찾은 경로는 프로세스 동안 기억한다
 * (2026-11-07: 페이지 이미지마다 버전 확인 프로세스를 여러 개 띄워 변환 순서까지 섞였다). 실패는 기억하지 않는다.
 */
export function resolveDocumentBinary(name: DocumentBinary) {
  let found = resolved.get(name);
  if (!found) {
    found = findDocumentBinary(name);
    resolved.set(name, found);
    found.catch(() => resolved.delete(name));
  }
  return found;
}

async function findDocumentBinary(name: DocumentBinary) {
  const envName = name === "pdftoppm" ? "PDFTOPPM_PATH" : "SOFFICE_PATH";
  const versionFlag = name === "pdftoppm" ? "-v" : "--version";
  const pathCandidates = (process.env.PATH ?? "")
    .split(path.delimiter)
    .filter(Boolean)
    .map((directory) => path.join(/* turbopackIgnore: true */ directory, name));
  const candidates = [
    process.env[envName],
    ...pathCandidates,
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    path.join(/* turbopackIgnore: true */ homedir(), `.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/${name}`),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      // LibreOffice에는 -v가 없고 첫 실행 때 프로필을 만드느라 시간이 걸릴 수 있다.
      await run(candidate, [versionFlag], { timeout: PROBE_TIMEOUT_MS });
      return candidate;
    } catch { /* Try the next known runtime location. */ }
  }
  throw new Error(`${name} 실행 파일을 찾을 수 없습니다.`);
}
