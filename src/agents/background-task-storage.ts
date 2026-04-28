import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type {
  AgentBackgroundTaskState,
  AgentBackgroundTaskStatus,
  AgentInstance,
  AgentTaskState,
} from "./types.js";

type AgentBackgroundTasksIndexFile = {
  backgroundTasks: AgentBackgroundTaskState[];
};

function resolveDataDir() {
  const customDir = process.env.ORQENT_DATA_DIR?.trim();

  if (customDir) {
    return customDir;
  }

  return join(homedir(), ".orqent");
}

export function getAgentBackgroundTasksIndexFilePath() {
  return join(resolveDataDir(), "agents", "background-tasks.json");
}

function createTimestampId(prefix: string): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/\D/g, "")
    .slice(0, 14);

  return `${prefix}_${timestamp}_${randomUUID()}`;
}

export function createAgentBackgroundTaskId(): string {
  return createTimestampId("agent_background_task");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeIsoDate(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed.toISOString();
}

function normalizeNullableIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function normalizeBackgroundTaskStatus(
  value: unknown,
): AgentBackgroundTaskStatus {
  if (
    value === "queued" ||
    value === "running" ||
    value === "completed" ||
    value === "failed" ||
    value === "cancelled"
  ) {
    return value;
  }

  return "queued";
}

function normalizeAgentBackgroundTaskState(
  value: unknown,
): AgentBackgroundTaskState | null {
  if (!isRecord(value)) {
    return null;
  }

  const backgroundTaskId = normalizeString(value.backgroundTaskId, "");
  const taskId = normalizeString(value.taskId, "");
  const agentInstanceId = normalizeString(value.agentInstanceId, "");
  const parentSessionId = normalizeString(value.parentSessionId, "");
  const agentIdentifier = normalizeString(value.agentIdentifier, "");
  const cwd = normalizeString(value.cwd, "");
  const input = normalizeString(value.input, "");

  if (
    !backgroundTaskId ||
    !taskId ||
    !agentInstanceId ||
    !parentSessionId ||
    !agentIdentifier ||
    !cwd ||
    !input
  ) {
    return null;
  }

  const now = new Date().toISOString();
  const createdAt = normalizeIsoDate(value.createdAt, now);
  const updatedAt = normalizeIsoDate(value.updatedAt, createdAt);

  return {
    backgroundTaskId,
    taskId,
    agentInstanceId,
    parentSessionId,
    agentIdentifier,
    cwd,
    status: normalizeBackgroundTaskStatus(value.status),
    input,
    result: normalizeNullableString(value.result),
    error: normalizeNullableString(value.error),
    createdAt,
    updatedAt,
    startedAt: normalizeNullableIsoDate(value.startedAt),
    completedAt: normalizeNullableIsoDate(value.completedAt),
    lastHeartbeatAt: normalizeNullableIsoDate(value.lastHeartbeatAt),
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
  };
}

function normalizeAgentBackgroundTasksIndexFile(
  value: unknown,
): AgentBackgroundTasksIndexFile {
  if (!isRecord(value) || !Array.isArray(value.backgroundTasks)) {
    return {
      backgroundTasks: [],
    };
  }

  return {
    backgroundTasks: value.backgroundTasks
      .map(normalizeAgentBackgroundTaskState)
      .filter(
        (task): task is AgentBackgroundTaskState => task !== null,
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  };
}

export function createAgentBackgroundTaskState({
  instance,
  taskState,
  metadata,
}: {
  instance: AgentInstance;
  taskState: AgentTaskState;
  metadata?: Record<string, unknown>;
}): AgentBackgroundTaskState {
  const now = new Date().toISOString();

  return {
    backgroundTaskId: createAgentBackgroundTaskId(),
    taskId: taskState.taskId,
    agentInstanceId: instance.instanceId,
    parentSessionId: instance.parentSessionId,
    agentIdentifier: instance.agentIdentifier,
    cwd: instance.cwd,
    status: "queued",
    input: taskState.input,
    result: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    lastHeartbeatAt: null,
    metadata,
  };
}

export async function listAgentBackgroundTasks(): Promise<
  AgentBackgroundTaskState[]
> {
  try {
    const raw = await readFile(getAgentBackgroundTasksIndexFilePath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;

    return normalizeAgentBackgroundTasksIndexFile(parsed).backgroundTasks;
  } catch {
    return [];
  }
}

export async function saveAgentBackgroundTasks(
  backgroundTasks: AgentBackgroundTaskState[],
): Promise<void> {
  const filePath = getAgentBackgroundTasksIndexFilePath();

  await mkdir(dirname(filePath), {
    recursive: true,
  });

  const normalizedTasks = backgroundTasks
    .map(normalizeAgentBackgroundTaskState)
    .filter(
      (task): task is AgentBackgroundTaskState => task !== null,
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  await writeFile(
    filePath,
    JSON.stringify(
      {
        backgroundTasks: normalizedTasks,
      },
      null,
      2,
    ),
    "utf8",
  );
}

export async function upsertAgentBackgroundTask(
  input: AgentBackgroundTaskState,
): Promise<AgentBackgroundTaskState> {
  const nextTask = normalizeAgentBackgroundTaskState(input);

  if (!nextTask) {
    throw new Error("Cannot persist invalid agent background task.");
  }

  const currentTasks = await listAgentBackgroundTasks();

  await saveAgentBackgroundTasks([
    nextTask,
    ...currentTasks.filter(
      (task) => task.backgroundTaskId !== nextTask.backgroundTaskId,
    ),
  ]);

  return nextTask;
}

export async function readAgentBackgroundTask(
  backgroundTaskId: string,
): Promise<AgentBackgroundTaskState | null> {
  const normalizedBackgroundTaskId = backgroundTaskId.trim();

  if (!normalizedBackgroundTaskId) {
    return null;
  }

  const tasks = await listAgentBackgroundTasks();

  return (
    tasks.find(
      (task) => task.backgroundTaskId === normalizedBackgroundTaskId,
    ) ?? null
  );
}

export function markAgentBackgroundTaskRunning(
  task: AgentBackgroundTaskState,
): AgentBackgroundTaskState {
  const now = new Date().toISOString();

  return {
    ...task,
    status: "running",
    updatedAt: now,
    startedAt: task.startedAt ?? now,
    lastHeartbeatAt: now,
  };
}

export function markAgentBackgroundTaskHeartbeat(
  task: AgentBackgroundTaskState,
): AgentBackgroundTaskState {
  const now = new Date().toISOString();

  return {
    ...task,
    updatedAt: now,
    lastHeartbeatAt: now,
  };
}

export function markAgentBackgroundTaskCompleted(
  task: AgentBackgroundTaskState,
  result: string,
): AgentBackgroundTaskState {
  const now = new Date().toISOString();

  return {
    ...task,
    status: "completed",
    result,
    error: null,
    updatedAt: now,
    completedAt: now,
    lastHeartbeatAt: now,
  };
}

export function markAgentBackgroundTaskFailed(
  task: AgentBackgroundTaskState,
  error: string,
): AgentBackgroundTaskState {
  const now = new Date().toISOString();

  return {
    ...task,
    status: "failed",
    result: null,
    error,
    updatedAt: now,
    completedAt: now,
    lastHeartbeatAt: now,
  };
}

export function markAgentBackgroundTaskCancelled(
  task: AgentBackgroundTaskState,
  reason: string,
): AgentBackgroundTaskState {
  const now = new Date().toISOString();

  return {
    ...task,
    status: "cancelled",
    result: null,
    error: reason,
    updatedAt: now,
    completedAt: now,
    lastHeartbeatAt: now,
  };
}