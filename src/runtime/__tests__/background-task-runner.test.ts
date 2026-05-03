import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAgentBackgroundTaskState,
  createAgentInstance,
  readAgentBackgroundTask,
  readAgentInstance,
  readAgentTaskState,
  upsertAgentBackgroundTask,
  upsertAgentDefinition,
  upsertAgentInstance,
  upsertAgentTaskState,
  listAgentInstances,
  listAgentTaskStates,
  type AgentDefinition,
} from "../../agents/index.js";
import {
  runQueuedBackgroundTask,
} from "../background-task-runner.js";
import type { SubagentChatRunner } from "../subagent-runner.js";

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
    allowedTools: [],
    model: "gemma4:e4b",
    scope: "project",
    memoryScope: "session",
    permissionMode: "ask",
    createdAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:00:00.000Z",
    ...overrides,
  };
}

async function seedQueuedBackgroundTask() {
  const definition = await upsertAgentDefinition(createDefinition());

  const { instance, taskState } = createAgentInstance({
    definition,
    parentSessionId: "session-parent",
    cwd: tempDir,
    taskInput: "Plan background work.",
    metadata: {
      createdByTool: "agent.spawn",
      runInBackground: true,
    },
  });

  await upsertAgentInstance(instance);
  await upsertAgentTaskState(taskState);

  const backgroundTask = createAgentBackgroundTaskState({
    instance,
    taskState,
    metadata: {
      createdByTool: "agent.spawn",
      runInBackground: true,
    },
  });

  await upsertAgentBackgroundTask(backgroundTask);

  return {
    definition,
    instance,
    taskState,
    backgroundTask,
  };
}

describe("background-task-runner", () => {
  it("ejecuta una background task queued y persiste completed", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-bg-runner-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const { backgroundTask, instance, taskState } =
      await seedQueuedBackgroundTask();

    const chatRunner = vi.fn<SubagentChatRunner>().mockResolvedValue({
      model: "gemma4:e4b",
      response: "Background plan ready.",
    });

    const result = await runQueuedBackgroundTask({
      backgroundTaskId: backgroundTask.backgroundTaskId,
      host: "http://localhost:11434",
      fallbackModel: "llama3.2:3b",
      chatRunner,
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error);
    }

    expect(result.response).toBe("Background plan ready.");
    expect(result.backgroundTask.status).toBe("completed");
    expect(result.backgroundTask.result).toBe("Background plan ready.");
    expect(result.backgroundTask.error).toBeNull();
    expect(result.backgroundTask.startedAt).not.toBeNull();
    expect(result.backgroundTask.completedAt).not.toBeNull();
    expect(result.instance.instanceId).toBe(instance.instanceId);
    expect(result.taskState.taskId).toBe(taskState.taskId);

    const instances = await listAgentInstances();
    const taskStates = await listAgentTaskStates();

    expect(instances).toHaveLength(1);
    expect(taskStates).toHaveLength(1);
    expect(instances[ 0 ]?.instanceId).toBe(instance.instanceId);
    expect(taskStates[ 0 ]?.taskId).toBe(taskState.taskId);

    await expect(
      readAgentBackgroundTask(backgroundTask.backgroundTaskId),
    ).resolves.toMatchObject({
      status: "completed",
      result: "Background plan ready.",
      error: null,
    });

    await expect(
      readAgentInstance(result.instance.instanceId),
    ).resolves.toMatchObject({
      status: "completed",
    });

    await expect(
      readAgentTaskState(result.taskState.taskId),
    ).resolves.toMatchObject({
      status: "completed",
      result: "Background plan ready.",
    });

    expect(chatRunner).toHaveBeenCalledTimes(1);
  });

  it("falla si backgroundTaskId no existe", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-bg-runner-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const result = await runQueuedBackgroundTask({
      backgroundTaskId: "missing",
      host: "http://localhost:11434",
      fallbackModel: "gemma4:e4b",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected failed result.");
    }

    expect(result.error).toBe('Background task "missing" was not found.');
    expect(result.backgroundTask).toBeNull();
  });

  it("rechaza ejecutar una background task que no está queued", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-bg-runner-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const { backgroundTask } = await seedQueuedBackgroundTask();

    await upsertAgentBackgroundTask({
      ...backgroundTask,
      status: "completed",
      result: "Already done.",
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    const result = await runQueuedBackgroundTask({
      backgroundTaskId: backgroundTask.backgroundTaskId,
      host: "http://localhost:11434",
      fallbackModel: "gemma4:e4b",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected failed result.");
    }

    expect(result.error).toContain("is not queued");
    expect(result.backgroundTask?.status).toBe("completed");
  });

  it("marca failed cuando el subagent runner falla", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-bg-runner-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const { backgroundTask } = await seedQueuedBackgroundTask();

    const chatRunner = vi.fn<SubagentChatRunner>().mockRejectedValue(
      new Error("Ollama failed."),
    );

    const result = await runQueuedBackgroundTask({
      backgroundTaskId: backgroundTask.backgroundTaskId,
      host: "http://localhost:11434",
      fallbackModel: "gemma4:e4b",
      chatRunner,
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected failed result.");
    }

    expect(result.error).toBe("Ollama failed.");
    expect(result.backgroundTask?.status).toBe("failed");
    expect(result.backgroundTask?.error).toBe("Ollama failed.");

    await expect(
      readAgentBackgroundTask(backgroundTask.backgroundTaskId),
    ).resolves.toMatchObject({
      status: "failed",
      error: "Ollama failed.",
    });
  });
});