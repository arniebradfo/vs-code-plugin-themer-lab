import assert from "node:assert/strict";
import { test } from "node:test";
import { iconMarkup } from "../src/webview/icons";

test("bundled product icons are decorative, local, current-color SVGs", () => {
  for (const name of [
    "info", "chevron-right", "chevron-down", "ellipsis", "loading",
    "window", "layout", "code", "terminal", "git-branch"
  ] as const) {
    const markup = iconMarkup(name);
    assert.match(markup, new RegExp(`^<svg class="codicon codicon-${name}"`));
    assert.match(markup, /width="16" height="16"/);
    assert.match(markup, /fill="currentColor" aria-hidden="true" focusable="false"/);
    assert.match(markup, /<path [^>]*d="[^"]+"/);
    assert.doesNotMatch(markup, /<(?:text|image|use|script)\b|\b(?:href|tabindex)=/);
    assert.equal(iconMarkup(name), markup);
  }
});

test("product artwork retains its native view box and multi-path fill rules", () => {
  assert.match(iconMarkup("terminal"), /viewBox="0 0 24 24"/);
  assert.match(iconMarkup("ellipsis"), /viewBox="0 0 16 16"/);
  const layout = iconMarkup("layout");
  assert.equal(layout.match(/<path /g)?.length, 3);
  assert.equal(layout.match(/fill-rule="evenodd" clip-rule="evenodd"/g)?.length, 3);
});
