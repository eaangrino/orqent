import { describe, expect, it } from "vitest";
import { buildAgentCatalogPrompt, type AgentDefinition } from "../index.js";

function createAgent(
  overrides: Partial<AgentDefinition> = {},
): AgentDefinition {
  return {
    identifier: "planner",
    name: "Planner",
    whenToUse: "Use for implementation planning.",
    systemPrompt: "Plan technical work.",
    allowedTools: [ "filesystem.read", "project.search" ],
    model: null,
    scope: "project",
    memoryScope: "session",
    permissionMode: "ask",
    createdAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildAgentCatalogPrompt", () => {
  it("construye prompt cuando no hay agentes persistentes", () => {
    const prompt = buildAgentCatalogPrompt([]);

    expect(prompt).toContain("Persistent agent catalog:");
    expect(prompt).toContain("No persistent agents are currently registered.");
    expect(prompt).toContain(
      "agent.spawn requires both executeNow and runInBackground explicitly",
    );
    expect(prompt).toContain(
      "executeNow=false and runInBackground=false creates a persistent agent instance",
    );
    expect(prompt).toContain(
      "executeNow=true and runInBackground=false runs the subagent synchronously",
    );
    expect(prompt).toContain(
      "executeNow=false and runInBackground=true creates a queued persistent background task",
    );
  });

  it("incluye agentes persistentes sin exponer systemPrompt", () => {
    const prompt = buildAgentCatalogPrompt([
      createAgent({
        identifier: "code-reviewer",
        name: "Code Reviewer",
        systemPrompt: "Private agent system prompt.",
      }),
    ]);

    expect(prompt).toContain('"identifier": "code-reviewer"');
    expect(prompt).toContain('"name": "Code Reviewer"');
    expect(prompt).toContain('"allowedTools"');
    expect(prompt).not.toContain("Private agent system prompt.");
  });

  it("incluye reglas para diferenciar spawn preparado, ejecutado y background", () => {
    const prompt = buildAgentCatalogPrompt([ createAgent() ]);

    expect(prompt).toContain(
      'When agent.spawn returns execution.status = "stubbed"',
    );
    expect(prompt).toContain(
      'When agent.spawn returns execution.status = "completed"',
    );
    expect(prompt).toContain(
      'When agent.spawn returns execution.status = "failed"',
    );
    expect(prompt).toContain(
      "Current synchronous subagent execution performs a direct model call with isolated context",
    );
    expect(prompt).toContain(
      "Do not claim that an agent inspected files, used tools, executed commands, ran in background, or modified external state",
    );
    expect(prompt).toContain(
      'When agent.spawn returns execution.status = "background_queued"',
    );
    expect(prompt).toContain(
      "use agent.run_background_task when a backgroundTaskId is available",
    );

    expect(prompt).toContain(
      "agent.run_background_task executes a queued background task through the runtime",
    );
  });
});