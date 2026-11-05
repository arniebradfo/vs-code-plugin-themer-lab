import assert from "node:assert/strict";
import { test } from "node:test";
import { releaseBlockers } from "../tools/check-release";

test("Marketplace publication rejects the local publisher and unlicensed snapshot", () => {
  const blockers = releaseBlockers({ publisher: "themer-local", license: "UNLICENSED" }, false);
  assert.equal(blockers.length, 3);
  assert.match(blockers.join("\n"), /publisher/);
  assert.match(blockers.join("\n"), /license/);
  assert.match(blockers.join("\n"), /LICENSE/);
});

test("Marketplace publication requires each prerequisite independently", () => {
  const ready = { publisher: "example-publisher", license: "MIT" };
  assert.deepEqual(releaseBlockers(ready, true), []);
  assert.equal(releaseBlockers({ ...ready, publisher: "themer-local" }, true).length, 1);
  assert.equal(releaseBlockers({ ...ready, publisher: " themer-local " }, true).length, 1);
  assert.equal(releaseBlockers({ ...ready, license: "UNLICENSED" }, true).length, 1);
  assert.equal(releaseBlockers({ ...ready, license: " unlicensed " }, true).length, 1);
  assert.equal(releaseBlockers(ready, false).length, 1);
  for (const invalid of [undefined, null, "", " ", 42]) {
    assert.equal(releaseBlockers({ ...ready, publisher: invalid }, true).length, 1);
    assert.equal(releaseBlockers({ ...ready, license: invalid }, true).length, 1);
  }
});
