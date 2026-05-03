import { describe, expect, it } from "vitest";
import {
  createAgentInstance,
  markAgentInstanceCancelled,
  markAgentInstanceCompleted,
  markAgentInstanceFailed,
  markAgentInstanceRunning,
  markAgentTaskCancelled,
  markAgentTaskCompleted,
  markAgentTaskFailed,
  markAgentTaskRunning,
  type AgentDefinition,
} from "../index.js";

function createDefinition(
  overrides: Partial<AgentDefinition> = {},
): AgentDefinition {
  return {
    identifier: "planner",
    name: "Planner",
    whenToUse: "Use for implementation planning.",
    systemPrompt: "Plan technical work.",
    allowedTools: [ "Project.Search", "filesystem.read", "project.search" ],
    model: "gemma4:e4b",
    scope: "project",
    memoryScope: "session",
    permissionMode: "ask",
    createdAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:00:00.000Z",
    ...overrides,
  };
}

describe("agent instance", () => {
  it("crea instancia y task state independiente desde una definición", () => {
    const result = createAgentInstance({
      definition: createDefinition(),
      parentSessionId: "session-parent",
      cwd: process.cwd(),
      taskInput: "Plan the next implementation step.",
    });

    expect(result.instance.instanceId).toMatch(/^agent_instance_/);
    expect(result.taskState.taskId).toMatch(/^agent_task_/);
    expect(result.instance.taskId).toBe(result.taskState.taskId);
    expect(result.taskState.agentInstanceId).toBe(result.instance.instanceId);

    expect(result.instance.parentSessionId).toBe("session-parent");
    expect(result.taskState.parentSessionId).toBe("session-parent");

    expect(result.instance.agentIdentifier).toBe("planner");
    expect(result.taskState.agentIdentifier).toBe("planner");

    expect(result.instance.status).toBe("created");
    expect(result.taskState.status).toBe("queued");

    expect(result.instance.systemPrompt).toBe("Plan technical work.");
    expect(result.taskState.input).toBe("Plan the next implementation step.");

    expect(result.instance.allowedTools).toEqual([
      "filesystem.read",
      "project.search",
    ]);
  });

  it("usa modelOverride cuando existe", () => {
    const result = createAgentInstance({
      definition: createDefinition({
        model: "gemma4:e4b",
      }),
      parentSessionId: "session-parent",
      cwd: process.cwd(),
      taskInput: "Plan work.",
      modelOverride: "llama3.2:3b",
    });

    expect(result.instance.model).toBe("llama3.2:3b");
  });

  it("usa modelo de la definición cuando no hay override", () => {
    const result = createAgentInstance({
      definition: createDefinition({
        model: "gemma4:e4b",
      }),
      parentSessionId: "session-parent",
      cwd: process.cwd(),
      taskInput: "Plan work.",
    });

    expect(result.instance.model).toBe("gemma4:e4b");
  });

  it("deja model null cuando no hay override ni modelo en definición", () => {
    const result = createAgentInstance({
      definition: createDefinition({
        model: null,
      }),
      parentSessionId: "session-parent",
      cwd: process.cwd(),
      taskInput: "Plan work.",
    });

    expect(result.instance.model).toBeNull();
  });

  it("rechaza parentSessionId vacío", () => {
    expect(() =>
      createAgentInstance({
        definition: createDefinition(),
        parentSessionId: "",
        cwd: process.cwd(),
        taskInput: "Plan work.",
      }),
    ).toThrow("parentSessionId cannot be empty.");
  });

  it("rechaza taskInput vacío", () => {
    expect(() =>
      createAgentInstance({
        definition: createDefinition(),
        parentSessionId: "session-parent",
        cwd: process.cwd(),
        taskInput: "   ",
      }),
    ).toThrow("taskInput cannot be empty.");
  });

  it("marca task state como running", () => {
    const { taskState } = createAgentInstance({
      definition: createDefinition(),
      parentSessionId: "session-parent",
      cwd: process.cwd(),
      taskInput: "Plan work.",
    });

    const running = markAgentTaskRunning(taskState);

    expect(running.status).toBe("running");
    expect(running.startedAt).not.toBeNull();
    expect(running.completedAt).toBeNull();
  });

  it("marca task state como completed", () => {
    const { taskState } = createAgentInstance({
      definition: createDefinition(),
      parentSessionId: "session-parent",
      cwd: process.cwd(),
      taskInput: "Plan work.",
    });

    const completed = markAgentTaskCompleted(taskState, "Done.");

    expect(completed.status).toBe("completed");
    expect(completed.result).toBe("Done.");
    expect(completed.error).toBeNull();
    expect(completed.completedAt).not.toBeNull();
  });

  it("marca task state como failed", () => {
    const { taskState } = createAgentInstance({
      definition: createDefinition(),
      parentSessionId: "session-parent",
      cwd: process.cwd(),
      taskInput: "Plan work.",
    });

    const failed = markAgentTaskFailed(taskState, "Boom.");

    expect(failed.status).toBe("failed");
    expect(failed.result).toBeNull();
    expect(failed.error).toBe("Boom.");
    expect(failed.completedAt).not.toBeNull();
  });

  it("marca task state como cancelled", () => {
    const { taskState } = createAgentInstance({
      definition: createDefinition(),
      parentSessionId: "session-parent",
      cwd: process.cwd(),
      taskInput: "Plan work.",
    });

    const cancelled = markAgentTaskCancelled(taskState, "User cancelled.");

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.result).toBeNull();
    expect(cancelled.error).toBe("User cancelled.");
    expect(cancelled.completedAt).not.toBeNull();
  });

  it("marca instancia como running", () => {
    const { instance } = createAgentInstance({
      definition: createDefinition(),
      parentSessionId: "session-parent",
      cwd: process.cwd(),
      taskInput: "Plan work.",
    });

    const running = markAgentInstanceRunning(instance);

    expect(running.status).toBe("running");
    expect(running.instanceId).toBe(instance.instanceId);
  });

  it("marca instancia como completed", () => {
    const { instance } = createAgentInstance({
      definition: createDefinition(),
      parentSessionId: "session-parent",
      cwd: process.cwd(),
      taskInput: "Plan work.",
    });

    const completed = markAgentInstanceCompleted(instance);

    expect(completed.status).toBe("completed");
    expect(completed.instanceId).toBe(instance.instanceId);
  });

  it("marca instancia como failed", () => {
    const { instance } = createAgentInstance({
      definition: createDefinition(),
      parentSessionId: "session-parent",
      cwd: process.cwd(),
      taskInput: "Plan work.",
    });

    const failed = markAgentInstanceFailed(instance);

    expect(failed.status).toBe("failed");
    expect(failed.instanceId).toBe(instance.instanceId);
  });

  it("marca instancia como cancelled", () => {
    const { instance } = createAgentInstance({
      definition: createDefinition(),
      parentSessionId: "session-parent",
      cwd: process.cwd(),
      taskInput: "Plan work.",
    });

    const cancelled = markAgentInstanceCancelled(instance);

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.instanceId).toBe(instance.instanceId);
  });
});