import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("leaving a LIVE player ends it after 60 minutes unless it returns or another player/presentation is open", async () => {
  let effectIndex = 0;
  let ref: { current: unknown } | undefined;
  const effects: { deps?: readonly unknown[]; cleanup?: () => void }[] = [];
  let cleanups: (() => void)[] = [];
  let setups: (() => void)[] = [];
  const react = {
    useRef: (initial: unknown) => ref ??= { current: initial },
    useEffect: (setup: () => void | (() => void), deps?: readonly unknown[]) => {
      const index = effectIndex++;
      if (deps && effects[index]?.deps?.every((value, i) => Object.is(value, deps[i]))) return;
      cleanups.push(() => effects[index]?.cleanup?.());
      setups.push(() => { effects[index] = { deps, cleanup: setup() || undefined }; });
    },
  };

  const held = new Map<string, number>();
  const waiters: { name: string; grant: () => void }[] = [];
  const release = (name: string) => {
    const count = (held.get(name) ?? 1) - 1;
    if (count) return held.set(name, count);
    held.delete(name);
    waiters.splice(0).forEach((waiter) => waiter.name === name ? waiter.grant() : waiters.push(waiter));
  };
  const locks = {
    query: async () => ({ held: [...held.keys()].map((name) => ({ name })) }),
    request: (name: string, options: { mode?: string; signal?: AbortSignal }, callback: () => unknown) => {
      const grant = () => {
        held.set(name, (held.get(name) ?? 0) + 1);
        return Promise.resolve(callback()).finally(() => release(name));
      };
      if (options.mode === "shared" || !held.has(name)) return grant();
      return new Promise((resolve, reject) => {
        waiters.push({ name, grant: () => grant().then(resolve, reject) });
        options.signal?.addEventListener("abort", () => reject(new Error("AbortError")));
      });
    },
  };
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let nextTimer = 0;
  const ended: string[] = [];
  const setStatus = async (id: string, status: string) => { ended.push(`${id}:${status}`); };

  const output = ts.transpileModule(readFileSync("app/_controller/use-live-auto-end.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {} as { useLiveAutoEnd: (id: string, live: boolean, save: typeof setStatus) => void };
  runInNewContext(output, {
    exports,
    require: () => react,
    navigator: { locks },
    AbortController,
    console,
    setTimeout: (callback: () => void, delay: number) => { timers.set(++nextTimer, { callback, delay }); return nextTimer; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const render = async (id: string, live: boolean) => {
    effectIndex = 0;
    cleanups = [];
    setups = [];
    exports.useLiveAutoEnd(id, live, setStatus);
    cleanups.forEach((cleanup) => cleanup());
    setups.forEach((setup) => setup());
    await flush();
  };
  const fire = async () => {
    const due = [...timers.values()];
    timers.clear();
    due.forEach(({ delay, callback }) => { assert.equal(delay, 60 * 60_000); callback(); });
    await flush();
  };

  await render("A", true);
  assert.equal(held.get("player:A"), 1, "an open player holds its shared lock");
  await render("B", false);
  assert.equal(held.has("player:A"), false);
  assert.equal(timers.size, 1, "leaving a LIVE player starts the countdown");
  await render("A", true);
  assert.equal(timers.size, 0, "returning to the player cancels it");

  await render("B", false);
  held.set("presentation:A", 1);
  held.set("player:A", 1);
  await fire();
  assert.deepEqual(ended, [], "an open presentation window or player tab keeps it LIVE");
  release("presentation:A");
  await flush();
  assert.equal(timers.size, 0, "waits until every window for the lecture closes");
  release("player:A");
  await flush();
  assert.equal(timers.size, 1, "restarts the countdown after the last window closes");
  await fire();
  assert.deepEqual(ended, ["A:ended"]);

  await render("C", false);
  assert.equal(timers.size, 0, "leaving a lecture that is not LIVE does nothing");
});
