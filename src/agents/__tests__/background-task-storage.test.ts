import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createAgentBackgroundTaskState,
  createAgentInstance,
  getAgentBackgroundTasksIndexFilePath,
  listAgentBackgroundTasks,
  markAgentBackgroundTaskCancelled,
  markAgentBackgroundTaskCompleted,
  markAgentBackgroundTaskFailed,
  markAgentBackgroundTaskHeartbeat,
  markAgentBackgroundTaskRunning,
  readAgentBackgroundTask,
  upsertAgentBackgroundTask,
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

function createBackgroundTask() {
  const { instance, taskState } = createAgentInstance({
    definition: createDefinition(),
    parentSessionId: "session-parent",
    cwd: tempDir || process.cwd(),
    taskInput: "Plan work.",
  });

  return createAgentBackgroundTaskState({
    instance,
    taskState,
    metadata: {
      createdByTool: "agent.spawn",
      runInBackground: true,
    },
  });
}

describe("agent background task storage", () => {
  it("devuelve lista vacía cuando no existe archivo", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-bg-task-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await expect(listAgentBackgroundTasks()).resolves.toEqual([]);
  });

  it("crea background task state desde instancia y task state", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-bg-task-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const backgroundTask = createBackgroundTask();

    expect(backgroundTask.backgroundTaskId).toMatch(
      /^agent_background_task_/,
    );
    expect(backgroundTask.status).toBe("queued");
    expect(backgroundTask.parentSessionId).toBe("session-parent");
    expect(backgroundTask.agentIdentifier).toBe("planner");
    expect(backgroundTask.input).toBe("Plan work.");
    expect(backgroundTask.result).toBeNull();
    expect(backgroundTask.error).toBeNull();
    expect(backgroundTask.startedAt).toBeNull();
    expect(backgroundTask.completedAt).toBeNull();
    expect(backgroundTask.lastHeartbeatAt).toBeNull();
    expect(backgroundTask.metadata).toEqual({
      createdByTool: "agent.spawn",
      runInBackground: true,
    });
  });

  it("persiste y lee background task state", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-bg-task-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const backgroundTask = createBackgroundTask();

    await upsertAgentBackgroundTask(backgroundTask);

    const raw = await readFile(getAgentBackgroundTasksIndexFilePath(), "utf8");
    const parsed = JSON.parse(raw);

    expect(parsed.backgroundTasks).toHaveLength(1);
    expect(parsed.backgroundTasks[ 0 ].backgroundTaskId).toBe(
      backgroundTask.backgroundTaskId,
    );

    await expect(
      readAgentBackgroundTask(backgroundTask.backgroundTaskId),
    ).resolves.toMatchObject({
      backgroundTaskId: backgroundTask.backgroundTaskId,
      status: "queued",
      input: "Plan work.",
    });
  });

  it("actualiza background task sin duplicarlo", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-bg-task-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const backgroundTask = createBackgroundTask();

    await upsertAgentBackgroundTask(backgroundTask);

    const completed = markAgentBackgroundTaskCompleted(
      backgroundTask,
      "Done.",
    );

    await upsertAgentBackgroundTask(completed);

    const tasks = await listAgentBackgroundTasks();

    expect(tasks).toHaveLength(1);
    expect(tasks[ 0 ]).toMatchObject({
      backgroundTaskId: backgroundTask.backgroundTaskId,
      status: "completed",
      result: "Done.",
      error: null,
    });
  });

  it("marca background task como running y heartbeat", () => {
    tempDir = "/tmp/orqent-agent-bg-task-test";

    const backgroundTask = createBackgroundTask();
    const running = markAgentBackgroundTaskRunning(backgroundTask);

    expect(running.status).toBe("running");
    expect(running.startedAt).not.toBeNull();
    expect(running.lastHeartbeatAt).not.toBeNull();

    const heartbeat = markAgentBackgroundTaskHeartbeat(running);

    expect(heartbeat.status).toBe("running");
    expect(heartbeat.lastHeartbeatAt).not.toBeNull();
  });

  it("marca background task como failed", () => {
    tempDir = "/tmp/orqent-agent-bg-task-test";

    const backgroundTask = createBackgroundTask();
    const failed = markAgentBackgroundTaskFailed(backgroundTask, "Boom.");

    expect(failed.status).toBe("failed");
    expect(failed.result).toBeNull();
    expect(failed.error).toBe("Boom.");
    expect(failed.completedAt).not.toBeNull();
  });

  it("marca background task como cancelled", () => {
    tempDir = "/tmp/orqent-agent-bg-task-test";

    const backgroundTask = createBackgroundTask();
    const cancelled = markAgentBackgroundTaskCancelled(
      backgroundTask,
      "User cancelled.",
    );

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.result).toBeNull();
    expect(cancelled.error).toBe("User cancelled.");
    expect(cancelled.completedAt).not.toBeNull();
  });

  it("ordena background tasks por updatedAt descendente", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-bg-task-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const older = {
      ...createBackgroundTask(),
      backgroundTaskId: "agent_background_task_older",
      updatedAt: "2026-04-27T00:01:00.000Z",
    };

    const newer = {
      ...createBackgroundTask(),
      backgroundTaskId: "agent_background_task_newer",
      updatedAt: "2026-04-27T00:03:00.000Z",
    };

    await upsertAgentBackgroundTask(older);
    await upsertAgentBackgroundTask(newer);

    const tasks = await listAgentBackgroundTasks();

    expect(tasks.map((task) => task.backgroundTaskId)).toEqual([
      "agent_background_task_newer",
      "agent_background_task_older",
    ]);
  });

  it("normaliza archivo corrupto o inválido como lista vacía", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-bg-task-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await mkdir(join(tempDir, "agents"), {
      recursive: true,
    });

    await writeFile(
      getAgentBackgroundTasksIndexFilePath(),
      JSON.stringify({
        backgroundTasks: [
          null,
          {
            backgroundTaskId: "",
          },
        ],
      }),
      "utf8",
    );

    await expect(listAgentBackgroundTasks()).resolves.toEqual([]);
  });
});