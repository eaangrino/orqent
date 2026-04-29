import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendAgentTranscriptEntry,
  createAgentBackgroundTaskState,
  createAgentInstance,
  listAgentChildTaskSnapshots,
  markAgentBackgroundTaskCompleted,
  markAgentInstanceCompleted,
  markAgentTaskCompleted,
  upsertAgentBackgroundTask,
  upsertAgentInstance,
  upsertAgentTaskState,
  type AgentDefinition,
} from "../index.js";

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

describe("agent parent-child coordination", () => {
  it("devuelve snapshots vacíos cuando el padre no tiene hijos", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-coordination-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await expect(
      listAgentChildTaskSnapshots({
        parentSessionId: "session-parent",
      }),
    ).resolves.toEqual([]);
  });

  it("consolida instance, task state, background task y transcript por parentSessionId", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-coordination-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const { instance, taskState } = createAgentInstance({
      definition: createDefinition(),
      parentSessionId: "session-parent",
      cwd: tempDir,
      taskInput: "Plan work.",
    });

    const completedInstance = markAgentInstanceCompleted(instance);
    const completedTask = markAgentTaskCompleted(taskState, "Plan ready.");

    await upsertAgentInstance(completedInstance);
    await upsertAgentTaskState(completedTask);

    const completedBackgroundTask = markAgentBackgroundTaskCompleted(
      createAgentBackgroundTaskState({
        instance: completedInstance,
        taskState: completedTask,
      }),
      "Background plan ready.",
    );

    await upsertAgentBackgroundTask(completedBackgroundTask);

    await appendAgentTranscriptEntry(completedInstance, {
      role: "system",
      content: "System prompt.",
      model: "gemma4:e4b",
    });

    await appendAgentTranscriptEntry(completedInstance, {
      role: "user",
      content: "Plan work.",
      model: "gemma4:e4b",
    });

    await appendAgentTranscriptEntry(completedInstance, {
      role: "assistant",
      content: "Background plan ready.",
      model: "gemma4:e4b",
    });

    const snapshots = await listAgentChildTaskSnapshots({
      parentSessionId: "session-parent",
      includeTranscript: true,
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[ 0 ]).toMatchObject({
      parentSessionId: "session-parent",
      agentIdentifier: "planner",
      instanceId: completedInstance.instanceId,
      taskId: completedTask.taskId,
      status: {
        instance: "completed",
        task: "completed",
        background: "completed",
      },
      input: "Plan work.",
      result: "Background plan ready.",
      error: null,
    });

    expect(snapshots[ 0 ]?.instance.instanceId).toBe(completedInstance.instanceId);
    expect(snapshots[ 0 ]?.taskState?.taskId).toBe(completedTask.taskId);
    expect(snapshots[ 0 ]?.backgroundTask?.backgroundTaskId).toBe(
      completedBackgroundTask.backgroundTaskId,
    );
    expect(snapshots[ 0 ]?.transcript.map((entry) => entry.role)).toEqual([
      "system",
      "user",
      "assistant",
    ]);
  });

  it("filtra hijos por parentSessionId", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-coordination-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const parentA = createAgentInstance({
      definition: createDefinition({
        identifier: "planner",
      }),
      parentSessionId: "session-a",
      cwd: tempDir,
      taskInput: "Plan work.",
    });

    const parentB = createAgentInstance({
      definition: createDefinition({
        identifier: "tester",
      }),
      parentSessionId: "session-b",
      cwd: tempDir,
      taskInput: "Write tests.",
    });

    await upsertAgentInstance(parentA.instance);
    await upsertAgentTaskState(parentA.taskState);

    await upsertAgentInstance(parentB.instance);
    await upsertAgentTaskState(parentB.taskState);

    const snapshots = await listAgentChildTaskSnapshots({
      parentSessionId: "session-a",
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[ 0 ]?.parentSessionId).toBe("session-a");
    expect(snapshots[ 0 ]?.agentIdentifier).toBe("planner");
    expect(snapshots[ 0 ]?.input).toBe("Plan work.");
  });

  it("rechaza parentSessionId vacío", async () => {
    await expect(
      listAgentChildTaskSnapshots({
        parentSessionId: "   ",
      }),
    ).rejects.toThrow("parentSessionId cannot be empty.");
  });
});