import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { formatElapsed } from "../_model/class/session.ts";

test("LIVE time resumes from the frozen value across repeated dialogs and resets on a new start", () => {
  let time = 10_000;
  let now: number | undefined;
  let clock: { current: { now: number; pausedMs: number } } | undefined;
  let tick: (() => void) | undefined;
  let effectIndex = 0;
  const effects: { deps: readonly unknown[]; cleanup?: () => void }[] = [];
  let cleanups: (() => void)[] = [];
  let setups: (() => void)[] = [];
  const react = {
    useState: (initial: () => number) => [now ??= initial(), (value: number) => { now = value; }],
    useRef: (initial: { now: number; pausedMs: number }) => clock ??= { current: initial },
    useEffect: (setup: () => void | (() => void), deps: readonly unknown[]) => {
      const index = effectIndex++;
      if (effects[index]?.deps.every((value, i) => Object.is(value, deps[i]))) return;
      cleanups.push(() => effects[index]?.cleanup?.());
      setups.push(() => { effects[index] = { deps, cleanup: setup() || undefined }; });
    },
  };
  const output = ts.transpileModule(readFileSync("app/_controller/use-live-audience.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {} as { useLiveElapsed: (startedAt: string | null, live: boolean, paused: boolean) => string | null };
  runInNewContext(output, {
    exports,
    require: (id: string) => id === "react" ? react : id.endsWith("/class/session") ? { formatElapsed } : {},
    Date: class extends Date { static now() { return time; } },
    setInterval: (callback: () => void) => { tick = callback; return 1; },
    clearInterval: () => { tick = undefined; },
  });
  let startedAt: string | null = new Date(0).toISOString();
  let live = true;
  let paused = false;
  const render = () => {
    effectIndex = 0;
    cleanups = [];
    setups = [];
    const value = exports.useLiveElapsed(startedAt, live, paused);
    cleanups.forEach((cleanup) => cleanup());
    setups.forEach((setup) => setup());
    return value;
  };
  const advance = (ms: number) => { time += ms; tick?.(); return render(); };

  assert.equal(render(), "00:10");
  advance(750);
  time += 200; // Open between ticks: preserve the displayed value too.
  paused = true;
  assert.equal(render(), "00:10");
  assert.equal(advance(30_000), "00:10");
  paused = false;
  assert.equal(render(), "00:10");
  assert.equal(advance(1_000), "00:11");
  paused = true;
  render();
  assert.equal(advance(5_000), "00:11");
  paused = false;
  render();
  assert.equal(advance(5_000), "00:16");
  paused = true;
  render();
  startedAt = new Date(time).toISOString();
  render();
  advance(3_000);
  paused = false;
  render();
  assert.equal(advance(1_000), "00:01");
  live = false;
  assert.equal(render(), null);
  live = true;
  startedAt = null;
  assert.equal(render(), null);
});

test("audience departures count immediately, ignore late heartbeats, rejoin after page restore, and keep total and peak", async () => {
  const cleanups: (() => void)[] = [];
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const window = new EventTarget();
  const messages: { payload: { id: string; left?: boolean }; keepalive: boolean }[] = [];
  let receive: (payload: unknown) => void = () => {};
  let audience = { count: 0, total: 0, peak: 0 }, time = 0, sequence = 0, timerId = 0, closed = false;
  type Audience = typeof audience;
  const output = ts.transpileModule(readFileSync("app/_controller/use-live-audience.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {} as { useLiveAudienceCount: (id: string, live: boolean) => Audience; useAudienceHeartbeat: (id: string) => void };
  runInNewContext(output, {
    exports, document, window, console,
    Date: class extends Date { static now() { return time; } },
    crypto: { randomUUID: () => `tab-${++sequence}` },
    setInterval: (callback: () => void, delay: number) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearInterval: (id: number) => timers.delete(id),
    require: (id: string) => id === "react" ? {
      useState: (initial: Audience) => [initial, (update: (prev: Audience) => Audience) => { audience = update(audience); }],
      useEffect: (setup: () => () => void) => { cleanups.push(setup()); },
    } : id.endsWith("/lecture-reactions") ? {
      lectureAudienceTopic: (id: string) => `lecture-audience:${id}`, LECTURE_AUDIENCE_EVENT: "here",
    } : id.endsWith("/realtime-reaction-service") ? {
      subscribeToRealtimeReactions: async (_topic: string, _event: string, handler: typeof receive) => {
        receive = handler; return () => { closed = true; };
      },
      publishRealtimeReaction: async (_topic: string, _event: string, payload: { id: string; left?: boolean }, keepalive = false) => {
        messages.push({ payload, keepalive }); receive(payload);
      },
    } : {},
  });
  exports.useLiveAudienceCount("lecture", true);
  exports.useAudienceHeartbeat("lecture");
  await Promise.resolve();
  assert.equal(audience.count, 1);
  const firstId = messages[0].payload.id;
  document.visibilityState = "hidden";
  document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(audience.count, 1, "a background tab is still open");
  window.dispatchEvent(new Event("pagehide"));
  assert.equal(audience.count, 0);
  assert.equal(messages.at(-1)?.keepalive, true);
  const sent = messages.length;
  window.dispatchEvent(new Event("pagehide"));
  assert.equal(messages.length, sent, "departure is sent once");
  receive({ id: firstId });
  assert.equal(audience.count, 0, "a late heartbeat must not revive a closed tab");
  document.visibilityState = "visible";
  window.dispatchEvent(new Event("pageshow"));
  assert.equal(audience.count, 1);
  assert.notEqual(messages.at(-1)?.payload.id, firstId);
  for (const payload of [null, { id: "" }, { id: "x".repeat(65) }, { id: 1 }]) receive(payload);
  assert.equal(audience.count, 1);
  cleanups[1]();
  assert.equal(audience.count, 0, "route unmount also sends departure");
  receive({ id: "crashed-tab" });
  receive({ id: "other-tab" });
  receive({ id: "other-tab" });
  assert.deepEqual({ ...audience }, { count: 2, total: 4, peak: 2 }, "total counts every tab id once, rejoins included");
  time += 151_000;
  for (const timer of timers.values()) if (timer.delay === 15_000) timer.callback();
  assert.deepEqual({ ...audience }, { count: 0, total: 4, peak: 2 }, "missing departure signals still expire; total and peak stay");
  cleanups[0]();
  assert.equal(closed, true);
  assert.equal(timers.size, 0);
});

test("timeline keeps one sample per tick up to 1440 and only real slide changes up to 5000", () => {
  const output = ts.transpileModule(readFileSync("app/_controller/use-live-audience.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  type Timeline = { samples: { at: string; audience: number; slide: number }[]; slideChanges: { at: string; slide: number }[] };
  const exports = {} as {
    addTimelineSample: (timeline: Timeline, sample: Timeline["samples"][number]) => Timeline;
    addSlideChange: (timeline: Timeline, change: Timeline["slideChanges"][number]) => Timeline;
  };
  runInNewContext(output, { exports, require: () => ({}) });
  const empty: Timeline = { samples: [], slideChanges: [] };
  let timeline = exports.addSlideChange(empty, { at: "a", slide: 1 });
  assert.deepEqual(empty, { samples: [], slideChanges: [] }, "pure");
  timeline = exports.addSlideChange(timeline, { at: "b", slide: 1 });
  timeline = exports.addSlideChange(timeline, { at: "c", slide: 2 });
  timeline = exports.addSlideChange(timeline, { at: "d", slide: 1 });
  assert.equal(timeline.slideChanges.map((change) => change.at).join(), "a,c,d");
  timeline = exports.addTimelineSample(timeline, { at: "e", audience: 3, slide: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(timeline.samples)), [{ at: "e", audience: 3, slide: 1 }]);
  const full: Timeline = { samples: Array(1440).fill(timeline.samples[0]), slideChanges: Array.from({ length: 5000 }, (_, slide) => ({ at: "x", slide })) };
  assert.equal(exports.addTimelineSample(full, { at: "f", audience: 1, slide: 1 }), full);
  assert.equal(exports.addSlideChange(full, { at: "f", slide: 9999 }), full);
});
