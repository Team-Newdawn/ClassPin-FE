import assert from "node:assert/strict";
import test from "node:test";
import { safeNextPath } from "./next-path.ts";

test("safeNextPath keeps same-site paths and rejects off-site redirects", () => {
  assert.equal(safeNextPath("/admin/folders/1?view=list#top"), "/admin/folders/1?view=list#top");
  for (const value of [null, "", "admin", "//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "https://evil.com"]) {
    assert.equal(safeNextPath(value), "/admin/dashboard", JSON.stringify(value));
  }
});
