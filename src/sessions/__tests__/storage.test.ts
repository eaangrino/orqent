import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendToolActionEntry,
  getToolActionsFilePath,
} from "../storage.js";

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, {
      recursive: true,
      force: true,
    });
    tempDir = "";
  }

  delete process.env.ORQENT_DATA_DIR;
});

describe("session tool action storage", () => {
  it("appendToolActionEntry persiste acciones de tool en JSONL por sesión", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-session-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const entry = await appendToolActionEntry("session/test", {
      toolName: "shell.execute",
      cwd: "/tmp/project",
      input: {
        command: "echo",
        args: [ "hola" ],
      },
      status: "executed",
      ok: true,
      durationMs: 12,
      risk: "high",
      permissions: [ "shell:execute" ],
      requiresConfirmation: true,
      isReadOnly: false,
      permissionEffect: "ask",
      permissionReason: "Tool requires confirmation.",
      confirmation: "allowed",
      metadata: {
        attempts: 1,
      },
    });

    const filePath = getToolActionsFilePath("session/test");
    const raw = await readFile(filePath, "utf8");
    const lines = raw.trim().split("\n");

    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[ 0 ]!) as typeof entry;

    expect(parsed.id).toBe(entry.id);
    expect(parsed.sessionId).toBe("session/test");
    expect(parsed.toolName).toBe("shell.execute");
    expect(parsed.status).toBe("executed");
    expect(parsed.ok).toBe(true);
    expect(parsed.confirmation).toBe("allowed");
    expect(filePath).toContain("session_test.tools.jsonl");
  });
});