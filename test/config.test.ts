import test from "node:test";
import assert from "node:assert/strict";
import { parseCliOptions } from "../src/config.js";

test("acepta el separador -- reenviado por pnpm", () => {
  const parsed = parseCliOptions([
    "--",
    "--once",
    "lista las tools disponibles",
  ]);

  assert.equal(parsed.once, "lista las tools disponibles");
});

test("acepta --once sin separador", () => {
  const parsed = parseCliOptions([
    "--once",
    "lee package.json",
  ]);

  assert.equal(parsed.once, "lee package.json");
});
