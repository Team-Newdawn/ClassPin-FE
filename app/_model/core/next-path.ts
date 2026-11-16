const BASE = "http://pin-class.invalid";
const DEFAULT_NEXT = "/admin/dashboard";

/** 로그인 뒤 돌아갈 `next` 값을 같은 사이트 경로로만 허용한다. `/\evil.com` 같은 우회도 URL 파서가 판정한다. */
export function safeNextPath(value: string | null) {
  if (!value?.startsWith("/")) return DEFAULT_NEXT;
  try {
    const url = new URL(value, BASE);
    return url.origin === BASE ? `${url.pathname}${url.search}${url.hash}` : DEFAULT_NEXT;
  } catch {
    return DEFAULT_NEXT;
  }
}
