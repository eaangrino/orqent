import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  getWorkspaceSkillMarkdownDir,
  listAvailableSkillDefinitions,
  upsertSkillDefinition,
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

describe("skill sources", () => {
  it("combina skills persistidas en JSON y skills Markdown", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-skill-sources-test-"));
    process.env.ORQENT_DATA_DIR = join(tempDir, "data");

    const workspace = join(tempDir, "workspace");
    const workspaceDir = getWorkspaceSkillMarkdownDir(workspace);

    await upsertSkillDefinition({
      identifier: "json-skill",
      name: "JSON Skill",
      description: "Stored in definitions.json.",
      instructions: "JSON instructions.",
    });

    await mkdir(workspaceDir, {
      recursive: true,
    });

    await writeFile(
      join(workspaceDir, "markdown-skill.md"),
      skillMarkdown({
        identifier: "markdown-skill",
        name: "Markdown Skill",
        description: "Stored as Markdown.",
        instructions: "Markdown instructions.",
      }),
      "utf8",
    );

    const skills = await listAvailableSkillDefinitions({
      cwd: workspace,
    });

    expect(skills.map((skill) => skill.identifier)).toEqual([
      "json-skill",
      "markdown-skill",
    ]);
  });

  it("Markdown sobreescribe una skill JSON con el mismo identifier", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-skill-sources-test-"));
    process.env.ORQENT_DATA_DIR = join(tempDir, "data");

    const workspace = join(tempDir, "workspace");
    const workspaceDir = getWorkspaceSkillMarkdownDir(workspace);

    await upsertSkillDefinition({
      identifier: "reviewer",
      name: "JSON Reviewer",
      description: "JSON description.",
      instructions: "JSON instructions.",
    });

    await mkdir(workspaceDir, {
      recursive: true,
    });

    await writeFile(
      join(workspaceDir, "reviewer.md"),
      skillMarkdown({
        identifier: "reviewer",
        name: "Markdown Reviewer",
        description: "Markdown description.",
        instructions: "Markdown instructions.",
      }),
      "utf8",
    );

    const skills = await listAvailableSkillDefinitions({
      cwd: workspace,
    });

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      identifier: "reviewer",
      name: "Markdown Reviewer",
      instructions: "Markdown instructions.",
    });
  });
});
