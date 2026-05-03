import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createToolRegistry, defaultToolRegistry, executeTool } from "../index.js";
import {
  createSkillDeleteTool,
  createSkillListTool,
  createSkillUpsertTool,
  type SkillListResult,
  type SkillUpsertResult,
  type SkillDeleteResult,
} from "../builtin/skills.js";

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

describe("skill tools", () => {
  it("registra skill tools en el registry por defecto", () => {
    expect(defaultToolRegistry.has("skill.list")).toBe(true);
    expect(defaultToolRegistry.has("skill.upsert")).toBe(true);
    expect(defaultToolRegistry.has("skill.delete")).toBe(true);
  });

  it("skill.upsert crea una skill declarativa con confirmación", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-skill-tools-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([
      createSkillUpsertTool(),
    ]);

    const result = await executeTool({
      registry,
      toolName: "skill.upsert",
      input: {
        identifier: "typescript-reviewer",
        name: "TypeScript Reviewer",
        description: "Reviews TypeScript code.",
        instructions: "Review TypeScript code with pragmatic feedback.",
        enabled: true,
        scope: "project",
        activation: {
          manual: true,
          auto: true,
          keywords: [ "typescript", "typecheck" ],
          filePatterns: [ "*.ts", "*.tsx" ],
          toolNames: [ "filesystem.read" ],
        },
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const upsertResult = result.result as SkillUpsertResult;

    expect(upsertResult.instructionsStored).toBe(true);
    expect(upsertResult.skill).toMatchObject({
      identifier: "typescript-reviewer",
      name: "TypeScript Reviewer",
      enabled: true,
      activation: {
        manual: true,
        auto: true,
        keywords: [ "typescript", "typecheck" ],
        filePatterns: [ "*.ts", "*.tsx" ],
        toolNames: [ "filesystem.read" ],
      },
    });
    expect(JSON.stringify(upsertResult)).not.toContain(
      "Review TypeScript code with pragmatic feedback.",
    );
  });

  it("skill.upsert queda bloqueada si no hay confirmación", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-skill-tools-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([
      createSkillUpsertTool(),
    ]);

    const result = await executeTool({
      registry,
      toolName: "skill.upsert",
      input: {
        identifier: "typescript-reviewer",
        name: "TypeScript Reviewer",
        description: "Reviews TypeScript code.",
        instructions: "Review TypeScript code.",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected confirmation failure.");
    }

    expect(result.error.code).toBe("tool_confirmation_required");
  });

  it("skill.list lista skills sin exponer instrucciones", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-skill-tools-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([
      createSkillUpsertTool(),
      createSkillListTool(),
    ]);

    await executeTool({
      registry,
      toolName: "skill.upsert",
      input: {
        identifier: "planner",
        name: "Planner",
        description: "Plans work.",
        instructions: "SECRET PLANNER INSTRUCTIONS.",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    const result = await executeTool({
      registry,
      toolName: "skill.list",
      input: {},
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const listResult = result.result as SkillListResult;

    expect(listResult.count).toBe(1);
    expect(listResult.skills[ 0 ]).toMatchObject({
      identifier: "planner",
      name: "Planner",
      description: "Plans work.",
    });
    expect(JSON.stringify(listResult)).not.toContain("SECRET PLANNER INSTRUCTIONS.");
  });

  it("skill.delete elimina una skill con confirmación", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-skill-tools-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([
      createSkillUpsertTool(),
      createSkillListTool(),
      createSkillDeleteTool(),
    ]);

    await executeTool({
      registry,
      toolName: "skill.upsert",
      input: {
        identifier: "temporary",
        name: "Temporary",
        description: "Temporary skill.",
        instructions: "Temporary instructions.",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    const deleteResult = await executeTool({
      registry,
      toolName: "skill.delete",
      input: {
        identifier: "temporary",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(deleteResult.ok).toBe(true);

    if (!deleteResult.ok) {
      throw new Error(deleteResult.error.message);
    }

    expect(deleteResult.result as SkillDeleteResult).toEqual({
      identifier: "temporary",
      deleted: true,
    });

    const listResult = await executeTool({
      registry,
      toolName: "skill.list",
      input: {
        includeDisabled: true,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(listResult.ok).toBe(true);

    if (!listResult.ok) {
      throw new Error(listResult.error.message);
    }

    expect((listResult.result as SkillListResult).skills).toEqual([]);
  });

  it("skill.upsert valida campos requeridos", async () => {
    const registry = createToolRegistry([
      createSkillUpsertTool(),
    ]);

    const result = await executeTool({
      registry,
      toolName: "skill.upsert",
      input: {
        identifier: "bad",
        name: "Bad",
        description: "Bad skill.",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected invalid input.");
    }

    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe("instructions is required.");
  });
});
