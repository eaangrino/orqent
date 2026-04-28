import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  deleteAgentDefinition,
  getAgentDefinitionsFilePath,
  listAgentDefinitions,
  readAgentDefinition,
  upsertAgentDefinition,
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

describe("agent definition storage", () => {
  it("listAgentDefinitions devuelve lista vacía cuando no existe archivo", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agents-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await expect(listAgentDefinitions()).resolves.toEqual([]);
  });

  it("upsertAgentDefinition crea una definición persistente", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agents-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const agent = await upsertAgentDefinition({
      identifier: "code-reviewer",
      name: "Code Reviewer",
      whenToUse: "Use for reviewing TypeScript changes.",
      systemPrompt: "You review code with strict, technical feedback.",
      allowedTools: [ "filesystem.read", "project.search" ],
      model: "gemma4:e4b",
      scope: "project",
      memoryScope: "session",
      permissionMode: "ask",
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:01:00.000Z",
    });

    expect(agent).toEqual({
      identifier: "code-reviewer",
      name: "Code Reviewer",
      whenToUse: "Use for reviewing TypeScript changes.",
      systemPrompt: "You review code with strict, technical feedback.",
      allowedTools: [ "filesystem.read", "project.search" ],
      model: "gemma4:e4b",
      scope: "project",
      memoryScope: "session",
      permissionMode: "ask",
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:01:00.000Z",
    });

    const raw = await readFile(getAgentDefinitionsFilePath(), "utf8");
    const parsed = JSON.parse(raw);

    expect(parsed.agents).toHaveLength(1);
    expect(parsed.agents[ 0 ]).toEqual(agent);
  });

  it("upsertAgentDefinition actualiza una definición existente sin duplicarla", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agents-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await upsertAgentDefinition({
      identifier: "planner",
      name: "Planner",
      whenToUse: "Use for planning.",
      systemPrompt: "Plan tasks.",
      allowedTools: [ "filesystem.read" ],
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:01:00.000Z",
    });

    await upsertAgentDefinition({
      identifier: "planner",
      name: "Project Planner",
      whenToUse: "Use for technical planning.",
      systemPrompt: "Plan implementation steps.",
      allowedTools: [ "filesystem.read", "project.search" ],
      updatedAt: "2026-04-27T00:02:00.000Z",
    });

    const agents = await listAgentDefinitions();

    expect(agents).toHaveLength(1);
    expect(agents[ 0 ]).toMatchObject({
      identifier: "planner",
      name: "Project Planner",
      whenToUse: "Use for technical planning.",
      systemPrompt: "Plan implementation steps.",
      allowedTools: [ "filesystem.read", "project.search" ],
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:02:00.000Z",
    });
  });

  it("readAgentDefinition devuelve una definición por identifier", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agents-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await upsertAgentDefinition({
      identifier: "tester",
      name: "Tester",
      whenToUse: "Use for tests.",
      systemPrompt: "Write and review tests.",
    });

    const agent = await readAgentDefinition("TESTER");

    expect(agent?.identifier).toBe("tester");
    expect(agent?.name).toBe("Tester");
  });

  it("deleteAgentDefinition elimina una definición existente", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agents-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await upsertAgentDefinition({
      identifier: "temporary-agent",
      name: "Temporary Agent",
      whenToUse: "Temporary usage.",
      systemPrompt: "Temporary prompt.",
    });

    await expect(deleteAgentDefinition("temporary-agent")).resolves.toBe(true);
    await expect(readAgentDefinition("temporary-agent")).resolves.toBeNull();
    await expect(deleteAgentDefinition("temporary-agent")).resolves.toBe(false);
  });

  it("normaliza archivo corrupto o inválido como lista vacía", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agents-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await mkdir(join(tempDir, "agents"), { recursive: true });

    await writeFile(
      getAgentDefinitionsFilePath(),
      JSON.stringify({
        agents: [
          null,
          {
            identifier: "",
          },
        ],
      }),
      "utf8",
    );

    await expect(listAgentDefinitions()).resolves.toEqual([]);
  });

  it("rechaza identifiers inválidos", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agents-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await expect(
      upsertAgentDefinition({
        identifier: "../bad",
        name: "Bad",
        whenToUse: "Never.",
        systemPrompt: "Invalid.",
      }),
    ).rejects.toThrow('Invalid agent identifier "../bad".');
  });

  it("rechaza agentes sin whenToUse o systemPrompt", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agents-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await expect(
      upsertAgentDefinition({
        identifier: "empty-agent",
        name: "Empty Agent",
        whenToUse: "",
        systemPrompt: "Prompt.",
      }),
    ).rejects.toThrow('Agent "empty-agent" requires whenToUse.');

    await expect(
      upsertAgentDefinition({
        identifier: "empty-agent",
        name: "Empty Agent",
        whenToUse: "Use it.",
        systemPrompt: "",
      }),
    ).rejects.toThrow('Agent "empty-agent" requires systemPrompt.');
  });
});