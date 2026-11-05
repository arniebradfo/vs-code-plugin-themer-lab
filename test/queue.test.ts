import assert from "node:assert/strict";
import { test } from "node:test";
import { SerialQueue } from "../src/extension/queue";

test("settings operations serialize and recovery still runs after a failure", async () => {
  const queue = new SerialQueue();
  const events: string[] = [];
  let unblock: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { unblock = resolve; });
  const first = queue.run(async () => {
    events.push("first-start");
    await gate;
    events.push("first-end");
    throw new Error("write failed");
  });
  const failure = assert.rejects(first, /write failed/);
  const second = queue.run(() => { events.push("restore"); });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["first-start"]);
  assert.ok(unblock);
  unblock();
  await failure;
  await second;
  assert.deepEqual(events, ["first-start", "first-end", "restore"]);
});
