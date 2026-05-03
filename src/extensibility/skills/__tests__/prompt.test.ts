import { describe, expect, it } from "vitest";
import {
  buildActiveSkillsPrompt,
  buildSkillCatalogPrompt,
  type SkillDefinition,
} from "../index.js";

function createSkill(
  overrides: Partial<SkillDefinition> = {},
): SkillDefinition {
  return {
    identifier: "typescript-reviewer",
    name: "TypeScript Reviewer",
    description: "Reviews TypeScript code.",
    instructions: "SECRET FULL INSTRUCTIONS. Review TypeScript strictly.",
    enabled: true,
    scope: "project",
    activation: {
      manual: true,
      auto: true,
      keywords: [ "typescript", "SECRET_KEYWORD" ],
      filePatterns: [ "*.ts" ],
      toolNames: [ "filesystem.read" ],
    },
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    metadata: {
      secret: "SECRET_METADATA",
    },
    ...overrides,
  };
}

describe("skills prompt", () => {
  it("construye catálogo cuando no hay skills configuradas", () => {
    const prompt = buildSkillCatalogPrompt([]);

    expect(prompt).toContain("Configured declarative skills catalog:");
    expect(prompt).toContain("No declarative skills are currently configured.");
    expect(prompt).toContain("Declarative skills catalog rules:");
  });

  it("incluye metadata segura sin exponer instrucciones ni señales crudas", () => {
    const prompt = buildSkillCatalogPrompt([
      createSkill(),
    ]);

    expect(prompt).toContain('"identifier": "typescript-reviewer"');
    expect(prompt).toContain('"name": "TypeScript Reviewer"');
    expect(prompt).toContain('"description": "Reviews TypeScript code."');
    expect(prompt).toContain('"enabled": true');
    expect(prompt).toContain('"manualActivation": true');
    expect(prompt).toContain('"autoActivation": true');
    expect(prompt).toContain('"hasKeywords": true');
    expect(prompt).toContain('"hasFilePatterns": true');
    expect(prompt).toContain('"hasToolNames": true');

    expect(prompt).not.toContain("SECRET FULL INSTRUCTIONS");
    expect(prompt).not.toContain("SECRET_KEYWORD");
    expect(prompt).not.toContain("SECRET_METADATA");
    expect(prompt).not.toContain("filesystem.read");
    expect(prompt).not.toContain("*.ts");
  });

  it("incluye reglas para no afirmar activación sin instrucciones activas", () => {
    const prompt = buildSkillCatalogPrompt([
      createSkill(),
    ]);

    expect(prompt).toContain(
      "Do not claim that a skill is active unless the runtime explicitly injects active skill instructions.",
    );
    expect(prompt).toContain(
      "wait for active skill instructions from the runtime",
    );
  });

  it("buildActiveSkillsPrompt indica que no hay skills activas", () => {
    const prompt = buildActiveSkillsPrompt([]);

    expect(prompt).toContain("Active declarative skills:");
    expect(prompt).toContain("No declarative skills are active for this turn.");
  });

  it("buildActiveSkillsPrompt inyecta instrucciones solo para skills activas", () => {
    const prompt = buildActiveSkillsPrompt([
      createSkill({
        enabled: true,
      }),
      createSkill({
        identifier: "disabled-skill",
        name: "Disabled Skill",
        enabled: false,
        instructions: "DISABLED SECRET INSTRUCTIONS.",
      }),
    ]);

    expect(prompt).toContain("## TypeScript Reviewer (typescript-reviewer)");
    expect(prompt).toContain("SECRET FULL INSTRUCTIONS. Review TypeScript strictly.");
    expect(prompt).not.toContain("DISABLED SECRET INSTRUCTIONS.");
    expect(prompt).toContain("Active skills rules:");
  });
});
