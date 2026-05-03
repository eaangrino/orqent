import { describe, expect, it } from "vitest";
import {
  extractActiveSkillMentionQuery,
  getSkillMentionSuggestions,
  replaceActiveSkillMention,
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

describe("skill mention helpers", () => {
  it("detecta @skill: al final del prompt", () => {
    expect(extractActiveSkillMentionQuery("usa @skill:")).toEqual({
      query: "",
    });
  });

  it("detecta query parcial de @skill", () => {
    expect(extractActiveSkillMentionQuery("usa @skill:Type")).toEqual({
      query: "type",
    });
  });

  it("no detecta menciones cerradas por espacio", () => {
    expect(extractActiveSkillMentionQuery("usa @skill:typescript-reviewer ahora")).toBeNull();
  });

  it("sugiere solo skills enabled y manuales", () => {
    const suggestions = getSkillMentionSuggestions({
      prompt: "revisa @skill:",
      skills: [
        createSkill({
          identifier: "typescript-reviewer",
        }),
        createSkill({
          identifier: "disabled-skill",
          enabled: false,
        }),
        createSkill({
          identifier: "auto-only-skill",
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

    expect(suggestions.map((suggestion) => suggestion.identifier)).toEqual([
      "typescript-reviewer",
    ]);
  });

  it("filtra sugerencias por identifier o name", () => {
    const suggestions = getSkillMentionSuggestions({
      prompt: "revisa @skill:review",
      skills: [
        createSkill({
          identifier: "typescript-reviewer",
          name: "TypeScript Reviewer",
        }),
        createSkill({
          identifier: "planner",
          name: "Planning Skill",
        }),
      ],
    });

    expect(suggestions.map((suggestion) => suggestion.identifier)).toEqual([
      "typescript-reviewer",
    ]);
  });

  it("reemplaza la mención activa y conserva el texto previo", () => {
    expect(
      replaceActiveSkillMention("revisa esto con @skill:type", "typescript-reviewer"),
    ).toBe("revisa esto con @skill:typescript-reviewer ");
  });

  it("no reemplaza cuando no hay mención activa", () => {
    expect(
      replaceActiveSkillMention("revisa esto", "typescript-reviewer"),
    ).toBe("revisa esto");
  });
});
