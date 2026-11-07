import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "./route.ts";

const post = (body: unknown) => POST(new Request("http://local/api/question-summary", { method: "POST", body: JSON.stringify(body) }));
const item = (text = "맥락이 뭔가요?") => ({ text, page: 2, reactions: 3 });

test("question summary requires an instructor token outside demo mode", async () => {
  for (const mode of ["rest", "supabase", undefined]) {
    if (mode) process.env.NEXT_PUBLIC_DATA_MODE = mode; else delete process.env.NEXT_PUBLIC_DATA_MODE;
    assert.equal((await post({ items: [item()] })).status, 401, String(mode));
  }
});

test("question summary rejects malformed input before calling Groq", async () => {
  process.env.NEXT_PUBLIC_DATA_MODE = "demo";
  delete process.env.GROQ_API_KEY;
  const invalid = [null, {}, { items: [] }, { items: [item(" ")] }, { items: [{ text: 1 }] }, { items: [item("a".repeat(301))] },
    { items: [{ ...item(), page: 0 }] }, { items: [{ ...item(), reactions: -1 }] }, { items: Array(21).fill(item()) }];
  for (const body of invalid) assert.equal((await post(body)).status, 400, JSON.stringify(body));
  assert.equal((await post({ items: [item()] })).status, 503);
});

test("folder purpose is validated and added to the system prompt", async () => {
  process.env.NEXT_PUBLIC_DATA_MODE = "demo";
  process.env.GROQ_API_KEY = "test";
  const realFetch = globalThis.fetch;
  let system = "";
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    system = JSON.parse(String(init.body)).messages[0].content;
    return Response.json({ choices: [{ message: { content: "요약" } }] });
  }) as typeof fetch;
  try {
    for (const body of [{ purpose: "unknown" }, { purpose: 3 }, { purpose: "other", purposeLabel: "a".repeat(41) }]) {
      assert.equal((await post({ items: [item()], ...body })).status, 400, JSON.stringify(body));
    }
    assert.equal((await post({ items: [item()] })).status, 200);
    assert.doesNotMatch(system, /사용 목적/);
    assert.equal((await post({ items: [item()], purpose: "feedback" })).status, 200);
    assert.match(system, /사용 목적 — 피드백/);
    assert.equal((await post({ items: [item()], purpose: "other", purposeLabel: ' 사내 "워크숍" ' })).status, 200);
    assert.match(system, /목적 이름: "사내  워크숍 "\./);
    assert.equal((await post({ items: [item()], purpose: "qa", purposeLabel: "무시됨" })).status, 200);
    assert.doesNotMatch(system, /무시됨/);
    assert.equal((await post({ items: [item()], locale: "en" })).status, 200);
    assert.match(system, /Two short plain-text sentences in English/);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.GROQ_API_KEY;
  }
});

test("identical summaries reuse the server cache and failures are not cached", async () => {
  process.env.NEXT_PUBLIC_DATA_MODE = "demo";
  process.env.GROQ_API_KEY = "test";
  const realFetch = globalThis.fetch;
  let calls = 0, fail = true;
  globalThis.fetch = (async () => {
    calls += 1;
    return fail ? new Response(null, { status: 500 }) : Response.json({ choices: [{ message: { content: "요약" } }] });
  }) as typeof fetch;
  try {
    const body = { items: [item("캐시 확인")] };
    assert.equal((await post(body)).status, 502);
    fail = false;
    assert.equal((await post(body)).status, 200);
    assert.equal((await post(body)).status, 200);
    assert.equal(calls, 2);
    assert.equal((await post({ items: [item("다른 질문")] })).status, 200);
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.GROQ_API_KEY;
  }
});

test("one instructor is stopped after 300 Groq calls an hour", async () => {
  process.env.NEXT_PUBLIC_DATA_MODE = "rest";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable";
  process.env.GROQ_API_KEY = "test";
  const realFetch = globalThis.fetch;
  let groq = 0;
  globalThis.fetch = (async (url: string | URL | Request) => {
    if (String(url).includes("/auth/v1/user")) return Response.json({ id: "instructor-a", is_anonymous: false, aud: "authenticated" });
    groq += 1;
    return Response.json({ choices: [{ message: { content: "요약" } }] });
  }) as typeof fetch;
  const ask = (n: number) => POST(new Request("http://local/api/question-summary", {
    method: "POST", headers: { Authorization: "Bearer instructor" }, body: JSON.stringify({ items: [item(`질문 ${n}`)] }),
  }));
  try {
    for (let n = 0; n < 300; n += 1) assert.equal((await ask(n)).status, 200, String(n));
    assert.equal((await ask(300)).status, 429);
    assert.equal((await ask(0)).status, 200, "a cached summary does not need a new Groq call");
    assert.equal(groq, 300);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.GROQ_API_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  }
});
