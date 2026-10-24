/** Plain HTTP stays on this machine: loopback, or the BE container on the shared `ohpin` docker network. */
const HTTP_HOSTS = ["localhost", "127.0.0.1", "[::1]", "ohpin-be"];

/** The OhPin REST origin from `REST_API_URL`, or null unless it is an HTTPS origin or an allowed HTTP origin. Bearer tokens go there. */
export function restOrigin(value = process.env.REST_API_URL || "https://ohpinbe.newdawn.co.kr"): string | null {
  const url = URL.canParse(value) ? new URL(value) : null;
  if (!url || url.username || url.password || url.pathname !== "/" || url.search || url.hash
    || (url.protocol !== "https:" && !(url.protocol === "http:" && HTTP_HOSTS.includes(url.hostname)))) return null;
  return url.origin;
}
