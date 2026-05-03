import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendAgentTranscriptEntry,
  createAgentInstance,
  getAgentTranscriptFilePath,
  readAgentTranscriptEntries,
  type AgentDefinition,
} from "../index.js";

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

function createDefinition(
  overrides: Partial<AgentDefinition> = {},
): AgentDefinition {
  return {
    identifier: "planner",
    name: "Planner",
    whenToUse: "Use for implementation planning.",
    systemPrompt: "Plan technical work.",
    allowedTools: [],
    model: "gemma4:e4b",
    scope: "project",
    memoryScope: "session",
    permissionMode: "ask",
    createdAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:00:00.000Z",
    ...overrides,
  };
}

describe("agent transcript storage", () => {
  it("devuelve lista vacía cuando no existe transcript", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-transcript-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await expect(
      readAgentTranscriptEntries("missing-instance"),
    ).resolves.toEqual([]);
  });

  it("persiste transcript aislado por instancia de agente", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-transcript-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const { instance } = createAgentInstance({
      definition: createDefinition(),
      parentSessionId: "session-parent",
      cwd: tempDir,
      taskInput: "Plan work.",
    });

    const systemEntry = await appendAgentTranscriptEntry(instance, {
      role: "system",
      content: "System prompt.",
      model: "gemma4:e4b",
      metadata: {
        type: "subagent_system_prompt",
      },
    });

    const userEntry = await appendAgentTranscriptEntry(instance, {
      role: "user",
      content: "Plan work.",
      model: "gemma4:e4b",
    });

    const assistantEntry = await appendAgentTranscriptEntry(instance, {
      role: "assistant",
      content: "Done.",
      model: "gemma4:e4b",
    });

    const filePath = getAgentTranscriptFilePath(instance.instanceId);
    const raw = await readFile(filePath, "utf8");
    const lines = raw.trim().split("\n");

    expect(lines).toHaveLength(3);
    expect(filePath).toContain("agents/transcripts/");
    expect(filePath).toContain(`${instance.instanceId}.jsonl`);

    await expect(
      readAgentTranscriptEntries(instance.instanceId),
    ).resolves.toEqual([
      systemEntry,
      userEntry,
      assistantEntry,
    ]);
  });

  it("normaliza entradas corruptas y conserva solo entradas válidas", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-transcript-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const { instance } = createAgentInstance({
      definition: createDefinition(),
      parentSessionId: "session-parent",
      cwd: tempDir,
      taskInput: "Plan work.",
    });

    const validEntry = await appendAgentTranscriptEntry(instance, {
      role: "assistant",
      content: "Done.",
      model: "gemma4:e4b",
    });

    await writeFile(
      getAgentTranscriptFilePath(instance.instanceId),
      [
        JSON.stringify(validEntry),
        "{invalid-json",
        JSON.stringify({
          role: "unknown",
          content: "bad",
        }),
      ].join("\n"),
      "utf8",
    );

    await expect(
      readAgentTranscriptEntries(instance.instanceId),
    ).resolves.toEqual([ validEntry ]);
  });
});