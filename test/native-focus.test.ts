import assert from "node:assert/strict";
import { test } from "node:test";
import { Script } from "node:vm";
import { browserProcessId, focusNativeTestWindow } from "./support/native-focus";

test("native activation selects only the browser PID reported by the isolated CDP endpoint", () => {
  assert.equal(browserProcessId({ processInfo: [
    { type: "renderer", id: 23 }, { type: "browser", id: 7644 }, { type: "GPU", id: 24 }
  ] }), 7644);
  for (const processInfo of [
    [], [{ type: "renderer", id: 23 }],
    [{ type: "browser", id: 1 }, { type: "browser", id: 2 }],
    ...[undefined, "7644", 0, -1, 1.5, Number.MAX_SAFE_INTEGER].map((id) => [{ type: "browser", id }])
  ]) {
    assert.throws(() => browserProcessId({ processInfo }), /valid isolated browser process ID/);
  }
  assert.throws(() => browserProcessId({}), /process list/);
});

test("Windows and Linux retain Page.bringToFront without native activation or focus emulation", async () => {
  for (const platform of ["win32", "linux"] as const) {
    await focusNativeTestWindow(undefined, async () => { throw new Error("Focus must not be inspected here."); }, {
      platform,
      execute: async () => { throw new Error("No platform command must run."); }
    });
  }
});

test("macOS activation passes the exact PID as an argument and waits for real document focus", async () => {
  let time = 0;
  let inspections = 0;
  let executions = 0;
  await focusNativeTestWindow(7644, async () => ++inspections === 3, {
    platform: "darwin",
    now: () => time,
    sleep: async (milliseconds) => { time += milliseconds; },
    execute: async (file, args, options) => {
      executions++;
      assert.equal(file, "osascript");
      assert.deepEqual(args.slice(0, 4), ["-l", "JavaScript", "-e", args[3]]);
      assert.equal(args[4], "7644");
      assert.deepEqual(options, { timeout: 10_000 });
      assert.match(args[3]!, /runningApplicationWithProcessIdentifier\(Number\(argv\[0\]\)\)/);
      assert.match(args[3]!, /activateWithOptions/);
      assert.doesNotMatch(args[3]!, /7644|System Events|Emulation/);
      assert.doesNotThrow(() => new Script(args[3]!));
    }
  });
  assert.equal(executions, 1);
  assert.equal(inspections, 3);
  assert.equal(time, 200);
});

test("invalid macOS PIDs fail before any process can be activated", async () => {
  for (const id of [undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER]) {
    await assert.rejects(focusNativeTestWindow(id, async () => true, {
      platform: "darwin",
      execute: async () => { throw new Error("No process must be activated."); }
    }), /valid isolated macOS browser process ID/);
  }
});

test("macOS activation errors and absent real focus remain failures", async () => {
  await assert.rejects(focusNativeTestWindow(7644, async () => true, {
    platform: "darwin", execute: async () => { throw new Error("Native activation denied."); }
  }), /Native activation denied/);
  let time = 0;
  await assert.rejects(focusNativeTestWindow(7644, async () => false, {
    platform: "darwin",
    now: () => time,
    sleep: async (milliseconds) => { time += milliseconds; },
    execute: async () => {}
  }), /did not acquire real document focus/);
  assert.equal(time, 10_000);
});
