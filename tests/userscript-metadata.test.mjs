// Language: en-GB. Permission changes must require an explicit verifier review.
import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyMasterMetadata } from "../verify-userscript-metadata.mjs";

const source = `// ==UserScript==
// @name YouTube Master Suite
// @namespace youtube.master-suite
// @version 1.2.0
// @description Synthetic metadata fixture
// @author Citizen
// @license GNU GPLv3
// @updateURL none
// @downloadURL none
// @match https://www.youtube.com/*
// @match https://consent.youtube.com/*
// @run-at document-start
// @sandbox raw
// @grant GM_getValue
// @grant GM_setValue
// @grant GM_addValueChangeListener
// @grant GM_removeValueChangeListener
// @noframes
// ==/UserScript==
(() => {})();
`;

test("approved metadata accepts both line endings and ignores runtime comments", () => {
  for (const candidate of [source, source.replaceAll("\n", "\r\n"), source + "// @grant GM_xmlhttpRequest\n"]) {
    assert.deepEqual(verifyMasterMetadata(candidate), { version: "1.2.0" });
  }
});
for (const extra of [
  "grant GM_xmlhttpRequest", "grant unsafeWindow", "grant GM_deleteValue", "grant none",
  "grant GM_getValue", "connect *", "require https://example.invalid/code.js",
  "resource remote https://example.invalid/data", "include https://example.invalid/*",
  "match https://example.invalid/*", "match https://www.youtube.com/*", "unwrap",
  "sandbox raw", "name YouTube Master Suite", "namespace youtube.master-suite",
]) test(`rejects unapproved or duplicate metadata: @${extra}`, () => {
  assert.throws(() => verifyMasterMetadata(source.replace("// ==/UserScript==", `// @${extra}\n// ==/UserScript==`)));
});
for (const [before, after] of [
  ["// @grant GM_setValue\n", ""], ["// @sandbox raw\n", ""],
  ["@sandbox raw", "@sandbox JavaScript"], ["@sandbox raw", "@sandbox DOM"],
  ["@namespace youtube.master-suite", "@namespace changed.identity"],
  ["@name YouTube Master Suite", "@name Another Script"],
  ["@downloadURL none", "@downloadURL https://example.invalid/update.user.js"],
  ["@updateURL none", "@updateURL https://example.invalid/update.meta.js"],
  ["// @noframes\n", ""], ["@noframes", "@noframes false"],
  ["// @match https://consent.youtube.com/*\n", ""],
]) test(`rejects changed permission or identity: ${before.trim()}`, () => {
  assert.throws(() => verifyMasterMetadata(source.replace(before, after)));
});
test("metadata must be the first block and cannot contain executable content", () => {
  assert.throws(() => verifyMasterMetadata("runFirst();\n" + source));
  assert.throws(() => verifyMasterMetadata(source.replace("// @noframes", "runFirst();\n// @noframes")));
});
