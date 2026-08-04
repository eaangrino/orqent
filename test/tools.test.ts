import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createBuiltinToolRegistry } from "../src/tools/index.js";

function context(rootDir: string, permissionMode: "ask" | "auto" | "read-only" = "auto") {
  return {
    rootDir,
    permissionMode,
    signal: new AbortController().signal,
    maxOutputBytes: 50_000,
    confirm: async () => true,
  } as const;
}

test("todas las tools se exportan como function tools nativas", () => {
  const tools = createBuiltinToolRegistry().toResponseTools(true);
  assert.equal(tools.length, 9);
  assert.ok(tools.every((tool) => tool.type === "function"));
  assert.ok(tools.every((tool) => tool.strict === true));
  assert.ok(tools.every((tool) => tool.parameters.additionalProperties === false));
  assert.ok(
    tools.every((tool) =>
      Object.keys(tool.parameters.properties).every((key) =>
        tool.parameters.required.includes(key),
      ),
    ),
  );
});

test("fs_replace reemplaza texto exacto", async () => {
  const root = await mkdtemp(join(tmpdir(), "orqent-tools-"));
  try {
    await writeFile(join(root, "a.txt"), "alpha beta gamma", "utf8");
    const registry = createBuiltinToolRegistry();
    const result = await registry.execute(
      "fs_replace",
      {
        path: "a.txt",
        old_text: "beta",
        new_text: "BETA",
        replace_all: false,
      },
      context(root),
    );
    assert.equal(result.ok, true);
    assert.equal(await readFile(join(root, "a.txt"), "utf8"), "alpha BETA gamma");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bloquea rutas que escapan del workspace", async () => {
  const root = await mkdtemp(join(tmpdir(), "orqent-tools-"));
  try {
    const result = await createBuiltinToolRegistry().execute(
      "fs_read",
      { path: "../secret.txt", start_line: null, end_line: null },
      context(root),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error.message, /escapa/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("read-only bloquea tools mutantes antes de ejecutar", async () => {
  const root = await mkdtemp(join(tmpdir(), "orqent-tools-"));
  try {
    const result = await createBuiltinToolRegistry().execute(
      "fs_write",
      { path: "blocked.txt", content: "x", overwrite: false },
      context(root, "read-only"),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "permission_denied");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
