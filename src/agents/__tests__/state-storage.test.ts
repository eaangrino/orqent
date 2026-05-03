import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createAgentInstance,
  getAgentInstancesIndexFilePath,
  getAgentTaskStatesIndexFilePath,
  listAgentInstances,
  listAgentTaskStates,
  markAgentTaskCompleted,
  readAgentInstance,
  readAgentTaskState,
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

describe("agent state storage", () => {
  it("devuelve listas vacías cuando no existen archivos", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-state-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await expect(listAgentInstances()).resolves.toEqual([]);
    await expect(listAgentTaskStates()).resolves.toEqual([]);
  });

  it("persiste y lee una instancia de agente", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-state-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const { instance } = createAgentInstance({
      definition: createDefinition(),
      parentSessionId: "session-parent",
      cwd: tempDir,
      taskInput: "Plan work.",
    });

    await upsertAgentInstance(instance);

    const raw = await readFile(getAgentInstancesIndexFilePath(), "utf8");
    const parsed = JSON.parse(raw);

    expect(parsed.instances).toHaveLength(1);
    expect(parsed.instances[ 0 ].instanceId).toBe(instance.instanceId);

    await expect(readAgentInstance(instance.instanceId)).resolves.toMatchObject({
      instanceId: instance.instanceId,
      agentIdentifier: "planner",
      parentSessionId: "session-parent",
    });
  });

  it("persiste y lee un task state de agente", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-state-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const { taskState } = createAgentInstance({
      definition: createDefinition(),
      parentSessionId: "session-parent",
      cwd: tempDir,
      taskInput: "Plan work.",
    });

    await upsertAgentTaskState(taskState);

    const raw = await readFile(getAgentTaskStatesIndexFilePath(), "utf8");
    const parsed = JSON.parse(raw);

    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[ 0 ].taskId).toBe(taskState.taskId);

    await expect(readAgentTaskState(taskState.taskId)).resolves.toMatchObject({
      taskId: taskState.taskId,
      agentIdentifier: "planner",
      parentSessionId: "session-parent",
      status: "queued",
    });
  });

  it("actualiza task state existente sin duplicarlo", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-state-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const { taskState } = createAgentInstance({
      definition: createDefinition(),
      parentSessionId: "session-parent",
      cwd: tempDir,
      taskInput: "Plan work.",
    });

    await upsertAgentTaskState(taskState);

    const completed = markAgentTaskCompleted(taskState, "Done.");
    await upsertAgentTaskState(completed);

    const tasks = await listAgentTaskStates();

    expect(tasks).toHaveLength(1);
    expect(tasks[ 0 ]).toMatchObject({
      taskId: taskState.taskId,
      status: "completed",
      result: "Done.",
      error: null,
    });
  });

  it("ordena instancias por updatedAt descendente", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-state-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const older = createAgentInstance({
      definition: createDefinition({
        identifier: "older",
      }),
      parentSessionId: "session-parent",
      cwd: tempDir,
      taskInput: "Older task.",
    }).instance;

    const newer = createAgentInstance({
      definition: createDefinition({
        identifier: "newer",
      }),
      parentSessionId: "session-parent",
      cwd: tempDir,
      taskInput: "Newer task.",
    }).instance;

    await upsertAgentInstance({
      ...older,
      updatedAt: "2026-04-27T00:01:00.000Z",
    });

    await upsertAgentInstance({
      ...newer,
      updatedAt: "2026-04-27T00:03:00.000Z",
    });

    const instances = await listAgentInstances();

    expect(instances.map((instance) => instance.agentIdentifier)).toEqual([
      "newer",
      "older",
    ]);
  });

  it("ordena task states por updatedAt descendente", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-state-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const older = createAgentInstance({
      definition: createDefinition({
        identifier: "older",
      }),
      parentSessionId: "session-parent",
      cwd: tempDir,
      taskInput: "Older task.",
    }).taskState;

    const newer = createAgentInstance({
      definition: createDefinition({
        identifier: "newer",
      }),
      parentSessionId: "session-parent",
      cwd: tempDir,
      taskInput: "Newer task.",
    }).taskState;

    await upsertAgentTaskState({
      ...older,
      updatedAt: "2026-04-27T00:01:00.000Z",
    });

    await upsertAgentTaskState({
      ...newer,
      updatedAt: "2026-04-27T00:03:00.000Z",
    });

    const tasks = await listAgentTaskStates();

    expect(tasks.map((task) => task.agentIdentifier)).toEqual([
      "newer",
      "older",
    ]);
  });

  it("normaliza archivos corruptos o inválidos como listas vacías", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-state-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await mkdir(join(tempDir, "agents"), { recursive: true });

    await writeFile(
      getAgentInstancesIndexFilePath(),
      JSON.stringify({
        instances: [ null, { instanceId: "" } ],
      }),
      "utf8",
    );

    await writeFile(
      getAgentTaskStatesIndexFilePath(),
      JSON.stringify({
        tasks: [ null, { taskId: "" } ],
      }),
      "utf8",
    );

    await expect(listAgentInstances()).resolves.toEqual([]);
    await expect(listAgentTaskStates()).resolves.toEqual([]);
  });
});