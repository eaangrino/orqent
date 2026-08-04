import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSession, SessionStore } from "../src/session/store.js";

test("SessionStore persiste los items completos del Responses API", async () => {
  const root = await mkdtemp(join(tmpdir(), "orqent-session-"));
  try {
    const store = new SessionStore(root);
    const session = createSession(root, "gemma4:e4b");
    session.input.push(
      { role: "user", content: "lee el archivo" },
      {
        type: "function_call",
        call_id: "call_1",
        name: "fs_read",
        arguments: "{}",
      },
      {
        type: "function_call_output",
        call_id: "call_1",
        output: "{\"ok\":true}",
      },
    );

    await store.save(session);
    const loaded = await store.load(session.id);
    assert.deepEqual(loaded.input, session.input);
    assert.equal(loaded.model, "gemma4:e4b");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
