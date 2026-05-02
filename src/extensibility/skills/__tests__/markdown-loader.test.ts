import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  getGlobalSkillMarkdownDir,
  getWorkspaceSkillMarkdownDir,
  listSkillMarkdownDefinitions,
  loadSkillMarkdownFiles,
} from "../index.js";

let tempDir = "";

function skillMarkdown({
  identifier,
  name,
  description,
  instructions,
}: {
  identifier: string;
  name: string;
  description: string;
  instructions: string;
}) {
  return `---
identifier: ${identifier}
name: ${name}
description: ${description}
enabled: true
scope: project
manual: true
auto: false
---

${instructions}
`;
}

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

describe("skill markdown loader", () => {
  it("devuelve lista vacía cuando no existen directorios markdown", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-skill-md-loader-test-"));
    process.env.ORQENT_DATA_DIR = join(tempDir, "data");

    await expect(
      listSkillMarkdownDefinitions({
        cwd: join(tempDir, "workspace"),
      }),
    ).resolves.toEqual([]);
  });

  it("carga skills markdown globales desde ORQENT_DATA_DIR/skills", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-skill-md-loader-test-"));
    process.env.ORQENT_DATA_DIR = join(tempDir, "data");

    const globalDir = getGlobalSkillMarkdownDir();

    await mkdir(globalDir, {
      recursive: true,
    });

    await writeFile(
      join(globalDir, "typescript-reviewer.md"),
      skillMarkdown({
        identifier: "typescript-reviewer",
        name: "TypeScript Reviewer",
        description: "Reviews TypeScript code.",
        instructions: "Review TypeScript strictly.",
      }),
      "utf8",
    );

    const skills = await listSkillMarkdownDefinitions({
      cwd: join(tempDir, "workspace"),
    });

    expect(skills).toHaveLength(1);
    expect(skills[ 0 ]).toMatchObject({
      identifier: "typescript-reviewer",
      name: "TypeScript Reviewer",
      instructions: "Review TypeScript strictly.",
    });
  });

  it("carga skills markdown del workspace desde .orqent/skills", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-skill-md-loader-test-"));
    process.env.ORQENT_DATA_DIR = join(tempDir, "data");

    const workspace = join(tempDir, "workspace");
    const workspaceDir = getWorkspaceSkillMarkdownDir(workspace);

    await mkdir(workspaceDir, {
      recursive: true,
    });

    await writeFile(
      join(workspaceDir, "planner.md"),
      skillMarkdown({
        identifier: "planner",
        name: "Planner",
        description: "Plans work.",
        instructions: "Create practical plans.",
      }),
      "utf8",
    );

    const loaded = await loadSkillMarkdownFiles({
      cwd: workspace,
    });

    expect(loaded).toHaveLength(1);
    expect(loaded[ 0 ]).toMatchObject({
      fileName: "planner.md",
      source: "workspace",
      skill: {
        identifier: "planner",
      },
    });
  });

  it("la skill del workspace sobreescribe una global con el mismo identifier", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-skill-md-loader-test-"));
    process.env.ORQENT_DATA_DIR = join(tempDir, "data");

    const workspace = join(tempDir, "workspace");
    const globalDir = getGlobalSkillMarkdownDir();
    const workspaceDir = getWorkspaceSkillMarkdownDir(workspace);

    await mkdir(globalDir, {
      recursive: true,
    });
    await mkdir(workspaceDir, {
      recursive: true,
    });

    await writeFile(
      join(globalDir, "reviewer.md"),
      skillMarkdown({
        identifier: "reviewer",
        name: "Global Reviewer",
        description: "Global description.",
        instructions: "Global instructions.",
      }),
      "utf8",
    );

    await writeFile(
      join(workspaceDir, "reviewer.md"),
      skillMarkdown({
        identifier: "reviewer",
        name: "Workspace Reviewer",
        description: "Workspace description.",
        instructions: "Workspace instructions.",
      }),
      "utf8",
    );

    const loaded = await loadSkillMarkdownFiles({
      cwd: workspace,
    });

    expect(loaded).toHaveLength(1);
    expect(loaded[ 0 ]).toMatchObject({
      source: "workspace",
      skill: {
        identifier: "reviewer",
        name: "Workspace Reviewer",
        instructions: "Workspace instructions.",
      },
    });
  });

  it("ignora archivos markdown inválidos", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-skill-md-loader-test-"));
    process.env.ORQENT_DATA_DIR = join(tempDir, "data");

    const globalDir = getGlobalSkillMarkdownDir();

    await mkdir(globalDir, {
      recursive: true,
    });

    await writeFile(join(globalDir, "bad.md"), "invalid", "utf8");

    await expect(listSkillMarkdownDefinitions()).resolves.toEqual([]);
  });
});
