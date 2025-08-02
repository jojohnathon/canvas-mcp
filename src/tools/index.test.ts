import { test } from "node:test";
import assert from "node:assert/strict";
import { tools } from "./index.js";

test("tools have unique names and execute functions", () => {
  assert.ok(Array.isArray(tools) && tools.length > 0);
  const names = tools.map((t) => t.name);
  assert.equal(new Set(names).size, tools.length);
  for (const tool of tools) {
    assert.equal(typeof tool.execute, "function");
  }
});
