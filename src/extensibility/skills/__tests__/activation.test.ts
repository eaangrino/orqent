import { describe, expect, it } from "vitest";
import {
  extractManualSkillIdentifiers,
  resolveActiveSkillsForPrompt,
  resolveAutomaticallyActivatedSkills,
  resolveManuallyActivatedSkills,
  type SkillDefinition,
} from "../index.js";

function createSkill(
  overrides: Partial<SkillDefinition> = {},
): SkillDefinition {
  return {
    identifier: "typescript-reviewer",
    name: "TypeScript Reviewer",
    description: "Reviews TypeScript code.",
    instructions: "Review TypeScript code.",
    enabled: true,
    scope: "project",
    activation: {
      manual: true,
      auto: false,
      keywords: [],
      filePatterns: [],
      toolNames: [],
    },
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("skill activation", () => {
  it("extrae identifiers con @skill:identifier", () => {
    expect(
      extractManualSkillIdentifiers("Revisa esto con @skill:typescript-reviewer"),
    ).toEqual([ "typescript-reviewer" ]);
  });

  it("extrae identifiers con /skill identifier", () => {
    expect(
      extractManualSkillIdentifiers("/skill TypeScript-Reviewer revisa este archivo"),
    ).toEqual([ "typescript-reviewer" ]);
  });

  it("deduplica identifiers manuales repetidos", () => {
    expect(
      extractManualSkillIdentifiers(
        "/skill typescript-reviewer @skill:typescript-reviewer",
      ),
    ).toEqual([ "typescript-reviewer" ]);
  });

  it("activa solo skills enabled y manual", () => {
    const selections = resolveManuallyActivatedSkills({
      prompt:
        "/skill typescript-reviewer /skill disabled-skill /skill auto-only-skill",
      skills: [
        createSkill({
          identifier: "typescript-reviewer",
          enabled: true,
          activation: {
            manual: true,
            auto: false,
            keywords: [],
            filePatterns: [],
            toolNames: [],
          },
        }),
        createSkill({
          identifier: "disabled-skill",
          enabled: false,
          activation: {
            manual: true,
            auto: false,
            keywords: [],
            filePatterns: [],
            toolNames: [],
          },
        }),
        createSkill({
          identifier: "auto-only-skill",
          enabled: true,
          activation: {
            manual: false,
            auto: true,
            keywords: [],
            filePatterns: [],
            toolNames: [],
          },
        }),
      ],
    });

    expect(selections.map((selection) => selection.skill.identifier)).toEqual([
      "typescript-reviewer",
    ]);
    expect(selections[ 0 ]?.source).toBe("manual");
    expect(selections[ 0 ]?.reason).toContain(
      'Matched explicit manual skill request for "typescript-reviewer".',
    );
  });

  it("ignora requests de skills inexistentes", () => {
    const selections = resolveManuallyActivatedSkills({
      prompt: "/skill missing-skill",
      skills: [
        createSkill(),
      ],
    });

    expect(selections).toEqual([]);
  });

  it("activa automáticamente por keyword", () => {
    const selections = resolveAutomaticallyActivatedSkills({
      prompt: "Necesito revisar TypeScript y ejecutar typecheck.",
      skills: [
        createSkill({
          identifier: "typescript-reviewer",
          activation: {
            manual: true,
            auto: true,
            keywords: [ "typescript", "typecheck" ],
            filePatterns: [],
            toolNames: [],
          },
        }),
      ],
    });

    expect(selections.map((selection) => selection.skill.identifier)).toEqual([
      "typescript-reviewer",
    ]);
    expect(selections[ 0 ]?.source).toBe("auto");
    expect(selections[ 0 ]?.reason).toContain(
      'Matched automatic skill keyword rule for "typescript-reviewer".',
    );
  });

  it("no activa automáticamente skills disabled o sin auto", () => {
    const selections = resolveAutomaticallyActivatedSkills({
      prompt: "typescript",
      skills: [
        createSkill({
          identifier: "disabled-skill",
          enabled: false,
          activation: {
            manual: true,
            auto: true,
            keywords: [ "typescript" ],
            filePatterns: [],
            toolNames: [],
          },
        }),
        createSkill({
          identifier: "manual-only-skill",
          enabled: true,
          activation: {
            manual: true,
            auto: false,
            keywords: [ "typescript" ],
            filePatterns: [],
            toolNames: [],
          },
        }),
      ],
    });

    expect(selections).toEqual([]);
  });

  it("resolveActiveSkillsForPrompt combina auto y manual con prioridad manual", () => {
    const selections = resolveActiveSkillsForPrompt({
      prompt: "typescript @skill:typescript-reviewer",
      skills: [
        createSkill({
          identifier: "typescript-reviewer",
          activation: {
            manual: true,
            auto: true,
            keywords: [ "typescript" ],
            filePatterns: [],
            toolNames: [],
          },
        }),
      ],
    });

    expect(selections).toHaveLength(1);
    expect(selections[ 0 ]?.skill.identifier).toBe("typescript-reviewer");
    expect(selections[ 0 ]?.source).toBe("manual");
  });
});
