import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

test("all views share one PDF task and release only the document, retaining the shared worker", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const state = { options: [], destroyed: 0, worker: {}, token: "first-token" };
  Object.assign(globalThis, { __pdfTest: state, location: { origin: "http://localhost" } });
  const pdfjs = `const s=globalThis.__pdfTest;export const GlobalWorkerOptions={workerPort:s.worker};export const PDFWorker={create:()=>s.worker};export function getDocument(options){s.options.push(options);return {promise:Promise.resolve({numPages:10}),destroy:async()=>{s.destroyed++}}}`;
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "pdfjs-dist/webpack.mjs") return { url: `data:text/javascript,${encodeURIComponent(pdfjs)}`, shortCircuit: true };
      if (specifier === "@/app/_infrastructure/supabase/client") return { url: "data:text/javascript,export async function getAccessToken(){return globalThis.__pdfTest.token}", shortCircuit: true };
      return next(specifier, context);
    },
  });
  try {
    const { acquirePdfDocument } = await import("./pdf-document.ts");
    const url = "/api/pdf?path=sample";
    const thumbnail = acquirePdfDocument(url);
    const stage = acquirePdfDocument(url);
    assert.equal(await thumbnail.promise, await stage.promise);
    await stage.promise;
    assert.equal(state.options.length, 1);
    assert.equal(state.options[0].rangeChunkSize, undefined);
    assert.equal(state.options[0].disableAutoFetch, true);
    assert.equal(state.options[0].disableStream, true);
    assert.equal(state.options[0].worker, state.worker, "explicit ownership prevents per-document destroy from terminating the worker");
    await thumbnail.release();
    context.mock.timers.tick(30_000);
    assert.equal(state.destroyed, 0);
    await stage.release();
    const revisited = acquirePdfDocument(url);
    assert.equal(await revisited.promise, await stage.promise);
    context.mock.timers.tick(30_000);
    assert.equal(state.destroyed, 0);
    await revisited.release();
    context.mock.timers.tick(30_000);
    assert.equal(state.destroyed, 1);
    const reopened = acquirePdfDocument(url);
    await reopened.promise;
    assert.equal(state.options.length, 2);
    await reopened.release();
    context.mock.timers.tick(30_000);
    assert.equal(state.destroyed, 2);

    const originalToken = acquirePdfDocument(url);
    await originalToken.promise;
    state.token = "renewed-token";
    const renewed = acquirePdfDocument(url);
    assert.notEqual(await renewed.promise, await originalToken.promise);
    assert.equal(state.options.at(-1).httpHeaders.Authorization, "Bearer renewed-token");
    await originalToken.release();
    await renewed.release();
    context.mock.timers.tick(30_000);
    assert.equal(state.destroyed, 4);
  } finally {
    hooks.deregister();
    Reflect.deleteProperty(globalThis, "__pdfTest");
    Reflect.deleteProperty(globalThis, "location");
  }
});
