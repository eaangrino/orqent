import { describe, expect, it } from "vitest";
import {
  createAgentRegistry,
  type AgentDefinition,
} from "../index.js";

function createAgent(
  overrides: Partial<AgentDefinition> = {},
): AgentDefinition {
  return {
    identifier: "planner",
    name: "Planner",
    whenToUse: "Use for planning.",
    systemPrompt: "Plan the task.",
    allowedTools: [ "filesystem.read" ],
    model: null,
    scope: "project",
    memoryScope: "session",
    permissionMode: "ask",
    createdAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:00:00.000Z",
    ...overrides,
  };
}

describe("AgentRegistry", () => {
  it("registra y obtiene agentes por identifier normalizado", () => {
    const registry = createAgentRegistry([
      createAgent({
        identifier: "Planner",
      }),
    ]);

    expect(registry.has("planner")).toBe(true);
    expect(registry.has("PLANNER")).toBe(true);
    expect(registry.get("planner")?.identifier).toBe("planner");
  });

  it("lista agentes ordenados por identifier", () => {
    const registry = createAgentRegistry([
      createAgent({
        identifier: "tester",
        name: "Tester",
      }),
      createAgent({
        identifier: "planner",
        name: "Planner",
      }),
    ]);

    expect(registry.list().map((agent) => agent.identifier)).toEqual([
      "planner",
      "tester",
    ]);
  });

  it("normaliza allowedTools", () => {
    const registry = createAgentRegistry([
      createAgent({
        allowedTools: [
          "Project.Search",
          "filesystem.read",
          "project.search",
          "",
          "  filesystem.read  ",
        ],
      }),
    ]);

    expect(registry.get("planner")?.allowedTools).toEqual([
      "filesystem.read",
      "project.search",
    ]);
  });

  it("rechaza agentes duplicados", () => {
    expect(() =>
      createAgentRegistry([
        createAgent({
          identifier: "planner",
        }),
        createAgent({
          identifier: "PLANNER",
        }),
      ]),
    ).toThrow('Agent "PLANNER" is already registered.');
  });

  it("rechaza identifiers inválidos", () => {
    expect(() =>
      createAgentRegistry([
        createAgent({
          identifier: "../bad",
        }),
      ]),
    ).toThrow('Invalid agent identifier "../bad".');
  });

  it("elimina agentes del registry en memoria", () => {
    const registry = createAgentRegistry([
      createAgent({
        identifier: "temporary-agent",
      }),
    ]);

    expect(registry.has("temporary-agent")).toBe(true);
    expect(registry.delete("temporary-agent")).toBe(true);
    expect(registry.has("temporary-agent")).toBe(false);
    expect(registry.delete("temporary-agent")).toBe(false);
  });
});