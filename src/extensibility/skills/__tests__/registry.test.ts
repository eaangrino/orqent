import { describe, expect, it } from "vitest";
import {
  createSkillRegistry,
  type SkillDefinition,
} from "../index.js";

function createSkill(
  overrides: Partial<SkillDefinition> = {},
): SkillDefinition {
  return {
    identifier: "typescript-reviewer",
    name: "TypeScript Reviewer",
    description: "Reviews TypeScript code.",
    instructions: "Review TypeScript code with pragmatic feedback.",
    enabled: true,
    scope: "project",
    activation: {
      manual: true,
      auto: false,
      keywords: [ "typescript" ],
      filePatterns: [ "*.ts", "*.tsx" ],
      toolNames: [ "filesystem.read" ],
    },
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("SkillRegistry", () => {
  it("registra y obtiene skills por identifier normalizado", () => {
    const registry = createSkillRegistry([
      createSkill({
        identifier: "TypeScript-Reviewer",
      }),
    ]);

    expect(registry.has("typescript-reviewer")).toBe(true);
    expect(registry.has("TYPESCRIPT-REVIEWER")).toBe(true);
    expect(registry.get("typescript-reviewer")?.identifier).toBe("typescript-reviewer");
  });

  it("lista skills ordenadas por identifier", () => {
    const registry = createSkillRegistry([
      createSkill({
        identifier: "z-skill",
      }),
      createSkill({
        identifier: "a-skill",
      }),
    ]);

    expect(registry.list().map((skill) => skill.identifier)).toEqual([
      "a-skill",
      "z-skill",
    ]);
  });

  it("lista solo skills enabled", () => {
    const registry = createSkillRegistry([
      createSkill({
        identifier: "enabled-skill",
        enabled: true,
      }),
      createSkill({
        identifier: "disabled-skill",
        enabled: false,
      }),
    ]);

    expect(registry.listEnabled().map((skill) => skill.identifier)).toEqual([
      "enabled-skill",
    ]);
  });

  it("lista skills de activación manual", () => {
    const registry = createSkillRegistry([
      createSkill({
        identifier: "manual-skill",
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
        identifier: "auto-only-skill",
        enabled: true,
        activation: {
          manual: false,
          auto: true,
          keywords: [ "auto" ],
          filePatterns: [],
          toolNames: [],
        },
      }),
    ]);

    expect(registry.listManual().map((skill) => skill.identifier)).toEqual([
      "manual-skill",
    ]);
  });

  it("lista skills de activación automática", () => {
    const registry = createSkillRegistry([
      createSkill({
        identifier: "manual-only-skill",
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
        identifier: "auto-skill",
        enabled: true,
        activation: {
          manual: true,
          auto: true,
          keywords: [ "auto" ],
          filePatterns: [],
          toolNames: [],
        },
      }),
    ]);

    expect(registry.listAuto().map((skill) => skill.identifier)).toEqual([
      "auto-skill",
    ]);
  });

  it("rechaza skills duplicadas", () => {
    expect(() =>
      createSkillRegistry([
        createSkill({
          identifier: "reviewer",
        }),
        createSkill({
          identifier: "REVIEWER",
        }),
      ]),
    ).toThrow('Skill "REVIEWER" is already registered.');
  });

  it("rechaza identifiers inválidos", () => {
    expect(() =>
      createSkillRegistry([
        createSkill({
          identifier: "../bad",
        }),
      ]),
    ).toThrow('Invalid skill identifier "../bad".');
  });

  it("elimina skills del registry en memoria", () => {
    const registry = createSkillRegistry([
      createSkill({
        identifier: "temporary",
      }),
    ]);

    expect(registry.has("temporary")).toBe(true);
    expect(registry.delete("temporary")).toBe(true);
    expect(registry.has("temporary")).toBe(false);
    expect(registry.delete("temporary")).toBe(false);
  });

  it("devuelve copias defensivas para evitar mutación externa", () => {
    const registry = createSkillRegistry([
      createSkill({
        identifier: "safe-copy",
        activation: {
          manual: true,
          auto: true,
          keywords: [ "before" ],
          filePatterns: [],
          toolNames: [],
        },
      }),
    ]);

    const skill = registry.get("safe-copy");

    if (!skill) {
      throw new Error("Expected skill.");
    }

    skill.activation.keywords.push("after");

    expect(registry.get("safe-copy")?.activation.keywords).toEqual([
      "before",
    ]);
  });
});
