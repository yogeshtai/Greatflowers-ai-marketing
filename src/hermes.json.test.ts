import assert from "node:assert/strict";
import test from "node:test";
import { requestHermesJSON, HermesOutputError, HermesUpstreamError } from "./hermes.json.js";
import { withRetry } from "./http.helpers.js";
import { parseModelJSON } from "./model.json.js";

test("repairs Markdown with original evidence, validates JSON, and shares the deadline", async (t) => {
  const oldKey = process.env.HERMES_API_KEY;
  process.env.HERMES_API_KEY = "test-only";
  t.after(() => { if (oldKey === undefined) delete process.env.HERMES_API_KEY; else process.env.HERMES_API_KEY = oldKey; });
  t.mock.method(console, "warn", () => {});
  const calls: RequestInit[] = [];
  let replies = ["## GreatFlowers Marketing Recommendation\n**Product:** Field Study flower", '{"productId":90}'];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    calls.push(init);
    return new Response(JSON.stringify({ choices: [{ message: { content: replies.shift() } }] }), { status: 200 });
  });
  const validate = (output: string) => {
    const parsed = JSON.parse(output);
    if (parsed.productId !== 90) throw new Error("Must select catalog product 90");
    return parsed;
  };
  const prompt = "Catalog product 90; GA4 views=3; required theme=flower-care. Return JSON.";
  const schema = { type: "object", properties: { productId: { type: "number" } }, required: ["productId"] };
  assert.deepEqual(await requestHermesJSON(prompt, validate, undefined, schema), { productId: 90 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]!.signal, calls[1]!.signal);
  const repair = JSON.parse(String(calls[1]!.body)).messages;
  assert.equal(repair[0].role, "system");
  assert.ok(repair[0].content.includes(JSON.stringify(schema)));
  assert.ok(repair.at(-1).content.includes(JSON.stringify(schema)));
  assert.ok(repair.at(-1).content.includes(prompt), "include original evidence even for bridges that only read the last user message");
  assert.ok(repair.at(-1).content.includes("previous response is not evidence"));

  calls.length = 0;
  replies = ['{"productId":999}', '{"productId":999}'];
  await assert.rejects(() => requestHermesJSON(prompt, validate), HermesOutputError);
  assert.equal(calls.length, 2, "stop after one repair; do not accept invalid products");

  calls.length = 0;
  replies = ['{"productId":90}'];
  await requestHermesJSON(prompt, validate);
  assert.equal(calls.length, 1, "valid responses require no repair");
});

test("an aborted request does not start a repair", async (t) => {
  const oldKey = process.env.HERMES_API_KEY;
  process.env.HERMES_API_KEY = "test-only";
  t.after(() => { if (oldKey === undefined) delete process.env.HERMES_API_KEY; else process.env.HERMES_API_KEY = oldKey; });
  const controller = new AbortController();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    controller.abort();
    return new Response(JSON.stringify({ choices: [{ message: { content: "Markdown" } }] }), { status: 200 });
  });
  await assert.rejects(() => requestHermesJSON("Return JSON", JSON.parse, controller.signal), { name: "AbortError" });
  assert.equal(calls, 1);
});

test("an upstream timeout response does not start a JSON repair", async (t) => {
  const oldKey = process.env.HERMES_API_KEY;
  process.env.HERMES_API_KEY = "test-only";
  t.after(() => { if (oldKey === undefined) delete process.env.HERMES_API_KEY; else process.env.HERMES_API_KEY = oldKey; });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response(JSON.stringify({
      choices: [{ message: { content: "API call failed after 3 retries: Request timed out." } }],
    }), { status: 200 });
  });

  await assert.rejects(
    () => requestHermesJSON("Return JSON", JSON.parse),
    HermesUpstreamError,
  );
  assert.equal(calls, 1, "a timeout sentence cannot be repaired into recommendation JSON");
});

test("an aborted-due-to-timeout response does not start a JSON repair", async (t) => {
  const oldKey = process.env.HERMES_API_KEY;
  process.env.HERMES_API_KEY = "test-only";
  t.after(() => { if (oldKey === undefined) delete process.env.HERMES_API_KEY; else process.env.HERMES_API_KEY = oldKey; });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response(JSON.stringify({
      choices: [{ message: { content: "The operation was aborted due to timeout" } }],
    }), { status: 200 });
  });

  await assert.rejects(
    () => requestHermesJSON("Return JSON", JSON.parse),
    HermesUpstreamError,
  );
  assert.equal(calls, 1);
});

test("a structured upstream error does not start a JSON repair", async (t) => {
  const oldKey = process.env.HERMES_API_KEY;
  process.env.HERMES_API_KEY = "test-only";
  t.after(() => { if (oldKey === undefined) delete process.env.HERMES_API_KEY; else process.env.HERMES_API_KEY = oldKey; });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response(JSON.stringify({ error: { message: "Request timed out" } }), { status: 200 });
  });

  await assert.rejects(
    () => requestHermesJSON("Return JSON", JSON.parse),
    HermesUpstreamError,
  );
  assert.equal(calls, 1);
});

test("an HTTP gateway timeout bypasses repair and outer retries", async (t) => {
  const oldKey = process.env.HERMES_API_KEY;
  process.env.HERMES_API_KEY = "test-only";
  t.after(() => { if (oldKey === undefined) delete process.env.HERMES_API_KEY; else process.env.HERMES_API_KEY = oldKey; });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response("Gateway Timeout", { status: 504 });
  });

  await assert.rejects(
    () => withRetry(() => requestHermesJSON("Return JSON", JSON.parse)),
    HermesUpstreamError,
  );
  assert.equal(calls, 1, "the JSON repair and route-level retry must both be skipped");
});

test("repairs missing JSON array and object separators locally without another Hermes call", async (t) => {
  const oldKey = process.env.HERMES_API_KEY;
  process.env.HERMES_API_KEY = "test-only";
  t.after(() => { if (oldKey === undefined) delete process.env.HERMES_API_KEY; else process.env.HERMES_API_KEY = oldKey; });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"items":[{"name":"roses"} {"name":"lilies"}],"meta":{"count":2 "valid":true}}' } }],
    }), { status: 200 });
  });

  const result = await requestHermesJSON("Return JSON", parseModelJSON);

  assert.deepEqual(result, {
    items: [{ name: "roses" }, { name: "lilies" }],
    meta: { count: 2, valid: true },
  });
  assert.equal(calls, 1, "deterministic syntax recovery must not spend another API call");
});

test("uses one compact repair for JSON syntax that cannot be fixed locally", async (t) => {
  const oldKey = process.env.HERMES_API_KEY;
  process.env.HERMES_API_KEY = "test-only";
  t.after(() => { if (oldKey === undefined) delete process.env.HERMES_API_KEY; else process.env.HERMES_API_KEY = oldKey; });
  t.mock.method(console, "warn", () => {});
  const calls: RequestInit[] = [];
  const replies = ['```json\n{"productId":90', '{"productId":90}'];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    calls.push(init);
    return new Response(JSON.stringify({ choices: [{ message: { content: replies.shift() } }] }), { status: 200 });
  });

  const result = await requestHermesJSON("A deliberately long original prompt", (output) => {
    const json = output.replace(/^```json\s*/i, "");
    return JSON.parse(json);
  });

  assert.deepEqual(result, { productId: 90 });
  assert.equal(calls.length, 2);
  const repair = JSON.parse(String(calls[1]!.body)).messages.at(-1).content;
  assert.match(repair, /^JSON SYNTAX REPAIR:/);
  assert.doesNotMatch(repair, /deliberately long original prompt/);
});
