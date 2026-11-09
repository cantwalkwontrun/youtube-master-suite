// Language: en-GB. Explicit release-permission boundary; not a privacy audit.
import assert from "node:assert/strict";

export function verifyMasterMetadata(source) {
  const block = source.match(/^(?:\uFEFF)?\/\/ ==UserScript==\r?\n([\s\S]*?)\r?\n\/\/ ==\/UserScript==[ \t]*(?:\r?\n|$)/);
  assert(block, "The master userscript must begin with its metadata block");
  const fields = new Map();
  const allowedFields = new Set([
    "name", "namespace", "version", "description", "author", "license",
    "updateURL", "downloadURL", "match", "run-at", "grant", "sandbox", "noframes",
  ]);
  for (const line of block[1].split(/\r?\n/)) {
    const entry = line.match(/^\/\/[ \t]+@([\w:-]+)(?:[ \t]+(.*))?$/);
    assert(entry, "Unexpected content in the master metadata block");
    const [, field, raw = ""] = entry;
    assert(allowedFields.has(field), `Unapproved master metadata field: @${field}`);
    if (!fields.has(field)) fields.set(field, []);
    fields.get(field).push(raw.trim());
  }
  function single(field) {
    const values = fields.get(field);
    assert.equal(values?.length, 1, `Expected exactly one @${field} metadata entry`);
    return values[0];
  }
  for (const [field, expected] of Object.entries({
    name: "YouTube Master Suite", namespace: "youtube.master-suite", author: "Citizen",
    license: "GNU GPLv3", updateURL: "none", downloadURL: "none",
    "run-at": "document-start", sandbox: "raw", noframes: "",
  })) assert.equal(single(field), expected, `Unexpected master @${field} metadata`);
  assert(single("description").length > 0, "The master description must not be empty");
  const version = single("version");
  assert.match(version, /^\d+\.\d+\.\d+$/, "Invalid master version");
  assert.deepEqual([...(fields.get("match") || [])].sort(), [
    "https://consent.youtube.com/*", "https://www.youtube.com/*",
  ], "Master site permissions must remain limited to the two YouTube origins");
  assert.deepEqual([...(fields.get("grant") || [])].sort(), [
    "GM_addValueChangeListener", "GM_getValue", "GM_removeValueChangeListener", "GM_setValue",
  ], "Master grants must contain exactly the approved private-storage APIs");
  return { version };
}
