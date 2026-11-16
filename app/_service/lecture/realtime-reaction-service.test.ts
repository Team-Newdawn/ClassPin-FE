import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("departure broadcasts start keepalive fetch before authentication; regular broadcasts reuse their channel", async () => {
  const requests: { url: string; init: RequestInit }[] = [];
  let authCalls = 0, channelSends = 0, status = 200;
  const channel = { subTopic: "lecture-audience:lecture", httpSend: async () => { channelSends++; } };
  const output = ts.transpileModule(readFileSync("app/_service/realtime-reaction-service.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {} as { publishRealtimeReaction: (topic: string, event: string, payload: Record<string, unknown>, keepalive?: boolean) => Promise<void> };
  runInNewContext(output, {
    exports,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://project.invalid", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-test-key" } },
    require: () => ({
      getAudienceSupabaseClient: () => ({
        getChannels: () => [channel],
        removeChannel: () => { throw new Error("Subscribed channel must stay connected"); },
      }),
      ensureAnonymousUser: async () => { authCalls++; },
    }),
    fetch: (url: string, init: RequestInit) => { requests.push({ url, init }); return Promise.resolve(new Response(null, { status })); },
  });
  const publish = exports.publishRealtimeReaction;
  const request = publish(channel.subTopic, "here", { id: "tab", left: true }, true);
  assert.equal(requests.length, 1, "fetch starts synchronously during pagehide");
  assert.equal(authCalls, 0);
  assert.equal(requests[0].init.keepalive, true);
  assert.equal(requests[0].url, "https://project.invalid/realtime/v1/api/broadcast/lecture-audience%3Alecture/events/here");
  assert.deepEqual(JSON.parse(String(requests[0].init.body)), { id: "tab", left: true });
  assert.equal(new Headers(requests[0].init.headers).get("apikey"), "public-test-key");
  await request;
  await publish(channel.subTopic, "here", { id: "tab" });
  assert.equal(authCalls, 1);
  assert.equal(channelSends, 1);
  assert.equal(requests.length, 1);
  status = 503;
  await assert.rejects(publish(channel.subTopic, "here", { id: "tab", left: true }, true), /503/);
});
