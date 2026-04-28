import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendToolActionEntry,
  appendTranscriptEntry,
  getChatSessionIndexFilePath,
  getToolActionsFilePath,
  listChatSessionMetadata,
  readTranscriptEntries,
  upsertChatSessionMetadata,
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
  it("listChatSessionMetadata devuelve lista vacía cuando no existe índice", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-session-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await expect(listChatSessionMetadata()).resolves.toEqual([]);
  });

  it("upsertChatSessionMetadata crea metadata de sesión en index.json", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-session-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const session = await upsertChatSessionMetadata({
      id: "session/test",
      title: "Primera sesión",
      cwd: "/tmp/project",
      model: "gemma4:e4b",
      messageCount: 2,
      lastMessagePreview: "Hola Orqent",
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:01:00.000Z",
    });

    expect(session).toEqual({
      id: "session/test",
      title: "Primera sesión",
      cwd: "/tmp/project",
      model: "gemma4:e4b",
      messageCount: 2,
      lastMessagePreview: "Hola Orqent",
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:01:00.000Z",
    });

    const raw = await readFile(getChatSessionIndexFilePath(), "utf8");
    const parsed = JSON.parse(raw);

    expect(parsed.sessions).toHaveLength(1);
    expect(parsed.sessions[ 0 ]).toEqual(session);
  });

  it("upsertChatSessionMetadata actualiza sesión existente sin duplicarla", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-session-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await upsertChatSessionMetadata({
      id: "session/test",
      title: "Primera sesión",
      cwd: "/tmp/project",
      model: "gemma4:e4b",
      messageCount: 1,
      lastMessagePreview: "Primer mensaje",
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:01:00.000Z",
    });

    await upsertChatSessionMetadata({
      id: "session/test",
      cwd: "/tmp/project",
      model: "llama3.2:3b",
      messageCount: 3,
      lastMessagePreview: "Mensaje actualizado",
      updatedAt: "2026-04-27T00:02:00.000Z",
    });

    const sessions = await listChatSessionMetadata();

    expect(sessions).toHaveLength(1);
    expect(sessions[ 0 ]).toMatchObject({
      id: "session/test",
      title: "Primera sesión",
      cwd: "/tmp/project",
      model: "llama3.2:3b",
      messageCount: 3,
      lastMessagePreview: "Mensaje actualizado",
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:02:00.000Z",
    });
  });

  it("listChatSessionMetadata ordena sesiones por updatedAt descendente", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-session-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await upsertChatSessionMetadata({
      id: "session/older",
      title: "Older",
      cwd: "/tmp/project",
      updatedAt: "2026-04-27T00:01:00.000Z",
    });

    await upsertChatSessionMetadata({
      id: "session/newer",
      title: "Newer",
      cwd: "/tmp/project",
      updatedAt: "2026-04-27T00:03:00.000Z",
    });

    const sessions = await listChatSessionMetadata();

    expect(sessions.map((session) => session.id)).toEqual([
      "session/newer",
      "session/older",
    ]);
  });

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

  it("readTranscriptEntries devuelve lista vacía cuando no existe transcript", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-session-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await expect(readTranscriptEntries("session/missing")).resolves.toEqual([]);
  });

  it("readTranscriptEntries reconstruye entradas válidas del transcript JSONL", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-session-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const userEntry = await appendTranscriptEntry("session/test", {
      role: "user",
      content: "Hola",
      model: "gemma4:e4b",
    });

    const assistantEntry = await appendTranscriptEntry("session/test", {
      role: "assistant",
      content: "Ok",
      model: "gemma4:e4b",
      metadata: {
        type: "test",
      },
    });

    await expect(readTranscriptEntries("session/test")).resolves.toEqual([
      userEntry,
      assistantEntry,
    ]);
  });
});