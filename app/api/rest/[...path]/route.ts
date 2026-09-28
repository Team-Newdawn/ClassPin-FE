async function forward(request: Request): Promise<Response> {
  const authorization = request.headers.get("authorization");
  if (!authorization || !/^Bearer \S+$/i.test(authorization)) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  try {
    const upstream = new URL(process.env.REST_API_URL || "https://ohpinbe.newdawn.co.kr");
    if (upstream.username || upstream.password || upstream.pathname !== "/" || upstream.search || upstream.hash
      || (upstream.protocol !== "https:" && !(upstream.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(upstream.hostname)))) {
      throw new Error("REST_API_URL must be an HTTPS origin or a local HTTP origin.");
    }
    const incoming = new URL(request.url);
    const headers = new Headers({ authorization });
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    const init: RequestInit & { duplex: "half" } = {
      method: request.method, headers, signal: request.signal,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      duplex: "half", cache: "no-store", redirect: "manual",
    };
    const response = await fetch(`${upstream.origin}/api${incoming.pathname.slice("/api/rest".length)}${incoming.search}`, init);
    const responseHeaders = new Headers({ "Cache-Control": "no-store" });
    const responseType = response.headers.get("content-type");
    if (responseType) responseHeaders.set("content-type", responseType);
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch {
    return Response.json({ error: "REST API unavailable" }, { status: 502 });
  }
}

export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
