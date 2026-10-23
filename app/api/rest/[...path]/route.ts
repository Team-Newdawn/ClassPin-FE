import { restOrigin } from "../../../_infrastructure/server/rest-origin.ts";

async function forward(request: Request): Promise<Response> {
  const authorization = request.headers.get("authorization");
  if (!authorization || !/^Bearer \S+$/i.test(authorization)) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  try {
    const upstream = restOrigin();
    if (!upstream) throw new Error("REST_API_URL must be an HTTPS origin or a local HTTP origin.");
    const incoming = new URL(request.url);
    const headers = new Headers({ authorization });
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    const init: RequestInit & { duplex: "half" } = {
      method: request.method, headers, signal: request.signal,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      duplex: "half", cache: "no-store", redirect: "manual",
    };
    const response = await fetch(`${upstream}/api${incoming.pathname.slice("/api/rest".length)}${incoming.search}`, init);
    const responseHeaders = new Headers({ "Cache-Control": "no-store" });
    const responseType = response.headers.get("content-type");
    if (responseType) responseHeaders.set("content-type", responseType);
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch (error) {
    if (!request.signal.aborted) console.error("REST proxy failed", error);
    return Response.json({ error: "REST API unavailable" }, { status: 502 });
  }
}

export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
