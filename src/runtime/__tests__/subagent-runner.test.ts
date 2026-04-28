import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readAgentInstance,
  readAgentTaskState,
  type AgentDefinition,
} from "../../agents/index.js";
import {
  buildSubagentSystemPrompt,
  runSubagentTask,
  type SubagentChatRunner,
} from "../subagent-runner.js";

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

function createDefinition(
  overrides: Partial<AgentDefinition> = {},
): AgentDefinition {
  return {
    identifier: "planner",
    name: "Planner",
    whenToUse: "Use for implementation planning.",
    systemPrompt: "Plan technical work.",
    allowedTools: [ "filesystem.read", "project.search" ],
    model: "gemma4:e4b",
    scope: "project",
    memoryScope: "session",
    permissionMode: "ask",
    createdAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:00:00.000Z",
    ...overrides,
  };
}

describe("subagent-runner", () => {
  it("construye system prompt aislado para el subagente", () => {
    const instance = {
      instanceId: "agent_instance_test",
      taskId: "agent_task_test",
      parentSessionId: "session-parent",
      agentIdentifier: "planner",
      cwd: "/tmp/project",
      model: "gemma4:e4b",
      status: "running" as const,
      systemPrompt: "Plan technical work.",
      allowedTools: [ "filesystem.read" ],
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:00.000Z",
    };

    const prompt = buildSubagentSystemPrompt(instance);

    expect(prompt).toContain("isolated Orqent subagent");
    expect(prompt).toContain("Agent identifier: planner");
    expect(prompt).toContain("Parent session id: session-parent");
    expect(prompt).toContain("Plan technical work.");
    expect(prompt).toContain(
      "This runner currently performs a direct model call without internal subagent tool calling.",
    );
  });

  it("ejecuta un subagente con chatRunner mockeado y persiste completed", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-subagent-runner-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const chatRunner = vi.fn<SubagentChatRunner>().mockResolvedValue({
      model: "gemma4:e4b",
      response: "Implementation plan ready.",
    });

    const result = await runSubagentTask({
      definition: createDefinition(),
      parentSessionId: "session-parent",
      cwd: tempDir,
      taskInput: "Plan the next implementation step.",
      host: "http://localhost:11434",
      fallbackModel: "llama3.2:3b",
      chatRunner,
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error);
    }

    expect(result.response).toBe("Implementation plan ready.");
    expect(result.instance.status).toBe("completed");
    expect(result.taskState.status).toBe("completed");
    expect(result.taskState.result).toBe("Implementation plan ready.");

    expect(chatRunner).toHaveBeenCalledTimes(1);
    expect(chatRunner.mock.calls[ 0 ]?.[ 0 ].model).toBe("gemma4:e4b");
    expect(chatRunner.mock.calls[ 0 ]?.[ 0 ].messages).toHaveLength(2);
    expect(chatRunner.mock.calls[ 0 ]?.[ 0 ].messages[ 0 ]?.role).toBe("system");
    expect(chatRunner.mock.calls[ 0 ]?.[ 0 ].messages[ 1 ]).toEqual({
      role: "user",
      content: "Plan the next implementation step.",
    });

    await expect(readAgentInstance(result.instance.instanceId)).resolves.toMatchObject({
      instanceId: result.instance.instanceId,
      status: "completed",
    });

    await expect(readAgentTaskState(result.taskState.taskId)).resolves.toMatchObject({
      taskId: result.taskState.taskId,
      status: "completed",
      result: "Implementation plan ready.",
    });
  });

  it("modelOverride gana sobre modelo de definición y fallback", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-subagent-runner-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const chatRunner = vi.fn<SubagentChatRunner>().mockResolvedValue({
      model: "llama3.2:3b",
      response: "Done.",
    });

    await runSubagentTask({
      definition: createDefinition({
        model: "gemma4:e4b",
      }),
      parentSessionId: "session-parent",
      cwd: tempDir,
      taskInput: "Plan work.",
      host: "http://localhost:11434",
      fallbackModel: "qwen2.5-coder:7b",
      modelOverride: "llama3.2:3b",
      chatRunner,
    });

    expect(chatRunner.mock.calls[ 0 ]?.[ 0 ].model).toBe("llama3.2:3b");
  });

  it("usa fallbackModel cuando la definición no tiene modelo", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-subagent-runner-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const chatRunner = vi.fn<SubagentChatRunner>().mockResolvedValue({
      model: "fallback-model",
      response: "Done.",
    });

    await runSubagentTask({
      definition: createDefinition({
        model: null,
      }),
      parentSessionId: "session-parent",
      cwd: tempDir,
      taskInput: "Plan work.",
      host: "http://localhost:11434",
      fallbackModel: "fallback-model",
      chatRunner,
    });

    expect(chatRunner.mock.calls[ 0 ]?.[ 0 ].model).toBe("fallback-model");
  });

  it("marca failed cuando no hay modelo disponible", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-subagent-runner-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const chatRunner = vi.fn<SubagentChatRunner>();

    const result = await runSubagentTask({
      definition: createDefinition({
        model: null,
      }),
      parentSessionId: "session-parent",
      cwd: tempDir,
      taskInput: "Plan work.",
      host: "http://localhost:11434",
      fallbackModel: null,
      chatRunner,
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected failed result.");
    }

    expect(result.error).toBe("No model available for subagent execution.");
    expect(result.instance.status).toBe("failed");
    expect(result.taskState.status).toBe("failed");
    expect(result.taskState.error).toBe(
      "No model available for subagent execution.",
    );
    expect(chatRunner).not.toHaveBeenCalled();
  });

  it("marca failed cuando el chatRunner falla", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-subagent-runner-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const chatRunner = vi.fn<SubagentChatRunner>().mockRejectedValue(
      new Error("Ollama failed."),
    );

    const result = await runSubagentTask({
      definition: createDefinition(),
      parentSessionId: "session-parent",
      cwd: tempDir,
      taskInput: "Plan work.",
      host: "http://localhost:11434",
      fallbackModel: null,
      chatRunner,
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected failed result.");
    }

    expect(result.error).toBe("Ollama failed.");
    expect(result.instance.status).toBe("failed");
    expect(result.taskState.status).toBe("failed");
    expect(result.taskState.error).toBe("Ollama failed.");

    await expect(readAgentTaskState(result.taskState.taskId)).resolves.toMatchObject({
      status: "failed",
      error: "Ollama failed.",
    });
  });
});