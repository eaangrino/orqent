import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  deleteSkillDefinition,
  getSkillDefinitionsFilePath,
  listSkillDefinitions,
  readSkillDefinition,
  upsertSkillDefinition,
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

describe("skill storage", () => {
  it("listSkillDefinitions devuelve lista vacía cuando no existe archivo", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-skills-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await expect(listSkillDefinitions()).resolves.toEqual([]);
  });

  it("upsertSkillDefinition crea una skill persistente", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-skills-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const skill = await upsertSkillDefinition({
      identifier: "TypeScriptReviewer",
      name: "TypeScript Reviewer",
      description: "Reviews TypeScript code for correctness and maintainability.",
      instructions: "Review TypeScript code with strict, pragmatic feedback.",
      enabled: true,
      scope: "project",
      activation: {
        manual: true,
        auto: true,
        keywords: [ "typescript", "ts", "typecheck" ],
        filePatterns: [ "*.ts", "*.tsx" ],
        toolNames: [ "filesystem.read", "project.search" ],
      },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:01:00.000Z",
    });

    expect(skill).toEqual({
      identifier: "typescriptreviewer",
      name: "TypeScript Reviewer",
      description: "Reviews TypeScript code for correctness and maintainability.",
      instructions: "Review TypeScript code with strict, pragmatic feedback.",
      enabled: true,
      scope: "project",
      activation: {
        manual: true,
        auto: true,
        keywords: [ "typescript", "ts", "typecheck" ],
        filePatterns: [ "*.ts", "*.tsx" ],
        toolNames: [ "filesystem.read", "project.search" ],
      },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:01:00.000Z",
    });

    const raw = await readFile(getSkillDefinitionsFilePath(), "utf8");
    const parsed = JSON.parse(raw);

    expect(parsed.skills).toHaveLength(1);
    expect(parsed.skills[ 0 ]).toEqual(skill);
  });

  it("upsertSkillDefinition actualiza una skill existente sin duplicarla", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-skills-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await upsertSkillDefinition({
      identifier: "reviewer",
      name: "Reviewer",
      description: "Initial description.",
      instructions: "Initial instructions.",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:01:00.000Z",
    });

    await upsertSkillDefinition({
      identifier: "REVIEWER",
      name: "Reviewer v2",
      description: "Updated description.",
      instructions: "Updated instructions.",
      enabled: false,
      activation: {
        auto: true,
        keywords: [ "review" ],
      },
      updatedAt: "2026-05-01T00:02:00.000Z",
    });

    const skills = await listSkillDefinitions();

    expect(skills).toHaveLength(1);
    expect(skills[ 0 ]).toMatchObject({
      identifier: "reviewer",
      name: "Reviewer v2",
      description: "Updated description.",
      instructions: "Updated instructions.",
      enabled: false,
      activation: {
        manual: true,
        auto: true,
        keywords: [ "review" ],
        filePatterns: [],
        toolNames: [],
      },
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:02:00.000Z",
    });
  });

  it("readSkillDefinition lee por identifier normalizado", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-skills-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await upsertSkillDefinition({
      identifier: "planner",
      name: "Planner",
      description: "Plans work.",
      instructions: "Create practical plans.",
    });

    await expect(readSkillDefinition("PLANNER")).resolves.toMatchObject({
      identifier: "planner",
      name: "Planner",
    });
  });

  it("deleteSkillDefinition elimina una skill existente", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-skills-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await upsertSkillDefinition({
      identifier: "temporary",
      name: "Temporary",
      description: "Temporary skill.",
      instructions: "Temporary instructions.",
    });

    await expect(deleteSkillDefinition("temporary")).resolves.toBe(true);
    await expect(readSkillDefinition("temporary")).resolves.toBeNull();
    await expect(deleteSkillDefinition("temporary")).resolves.toBe(false);
  });

  it("normaliza archivo corrupto o inválido como lista vacía", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-skills-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await mkdir(join(tempDir, "skills"), {
      recursive: true,
    });

    await writeFile(
      getSkillDefinitionsFilePath(),
      JSON.stringify({
        skills: [
          null,
          {
            identifier: "",
          },
          {
            identifier: "missing_instructions",
            name: "Bad",
            description: "Bad skill.",
          },
        ],
      }),
      "utf8",
    );

    await expect(listSkillDefinitions()).resolves.toEqual([]);
  });

  it("rechaza identifiers inválidos", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-skills-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await expect(
      upsertSkillDefinition({
        identifier: "../bad",
        name: "Bad",
        description: "Bad skill.",
        instructions: "Bad instructions.",
      }),
    ).rejects.toThrow('Invalid skill identifier "../bad".');
  });
});
