import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type {
  AgentInstance,
  AgentInstanceStatus,
  AgentTaskState,
  AgentTaskStatus,
} from "./types.js";

type AgentInstancesIndexFile = {
  instances: AgentInstance[];
};

type AgentTaskStatesIndexFile = {
  tasks: AgentTaskState[];
};

function resolveDataDir() {
  const customDir = process.env.ORQENT_DATA_DIR?.trim();

  if (customDir) {
    return customDir;
  }

  return join(homedir(), ".orqent");
}

export function getAgentInstancesIndexFilePath() {
  return join(resolveDataDir(), "agents", "instances.json");
}

export function getAgentTaskStatesIndexFilePath() {
  return join(resolveDataDir(), "agents", "tasks.json");
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

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
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

function normalizeAgentInstanceStatus(value: unknown): AgentInstanceStatus {
  if (
    value === "created" ||
    value === "running" ||
    value === "completed" ||
    value === "failed" ||
    value === "cancelled"
  ) {
    return value;
  }

  return "created";
}

function normalizeAgentTaskStatus(value: unknown): AgentTaskStatus {
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

function normalizeAgentInstance(value: unknown): AgentInstance | null {
  if (!isRecord(value)) {
    return null;
  }

  const instanceId = normalizeString(value.instanceId, "");
  const taskId = normalizeString(value.taskId, "");
  const parentSessionId = normalizeString(value.parentSessionId, "");
  const agentIdentifier = normalizeString(value.agentIdentifier, "");
  const cwd = normalizeString(value.cwd, "");

  if (!instanceId || !taskId || !parentSessionId || !agentIdentifier || !cwd) {
    return null;
  }

  if (typeof value.systemPrompt !== "string" || !value.systemPrompt.trim()) {
    return null;
  }

  const now = new Date().toISOString();
  const createdAt = normalizeIsoDate(value.createdAt, now);
  const updatedAt = normalizeIsoDate(value.updatedAt, createdAt);

  return {
    instanceId,
    taskId,
    parentSessionId,
    agentIdentifier,
    cwd,
    model: normalizeNullableString(value.model),
    status: normalizeAgentInstanceStatus(value.status),
    systemPrompt: value.systemPrompt,
    allowedTools: normalizeStringArray(value.allowedTools),
    createdAt,
    updatedAt,
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
  };
}

function normalizeAgentTaskState(value: unknown): AgentTaskState | null {
  if (!isRecord(value)) {
    return null;
  }

  const taskId = normalizeString(value.taskId, "");
  const agentInstanceId = normalizeString(value.agentInstanceId, "");
  const parentSessionId = normalizeString(value.parentSessionId, "");
  const agentIdentifier = normalizeString(value.agentIdentifier, "");
  const input = normalizeString(value.input, "");

  if (
    !taskId ||
    !agentInstanceId ||
    !parentSessionId ||
    !agentIdentifier ||
    !input
  ) {
    return null;
  }

  const now = new Date().toISOString();
  const createdAt = normalizeIsoDate(value.createdAt, now);
  const updatedAt = normalizeIsoDate(value.updatedAt, createdAt);

  return {
    taskId,
    agentInstanceId,
    parentSessionId,
    agentIdentifier,
    status: normalizeAgentTaskStatus(value.status),
    input,
    result: normalizeNullableString(value.result),
    error: normalizeNullableString(value.error),
    createdAt,
    updatedAt,
    startedAt: normalizeNullableIsoDate(value.startedAt),
    completedAt: normalizeNullableIsoDate(value.completedAt),
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
  };
}

function normalizeAgentInstancesIndexFile(
  value: unknown,
): AgentInstancesIndexFile {
  if (!isRecord(value) || !Array.isArray(value.instances)) {
    return {
      instances: [],
    };
  }

  return {
    instances: value.instances
      .map(normalizeAgentInstance)
      .filter((instance): instance is AgentInstance => instance !== null)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  };
}

function normalizeAgentTaskStatesIndexFile(
  value: unknown,
): AgentTaskStatesIndexFile {
  if (!isRecord(value) || !Array.isArray(value.tasks)) {
    return {
      tasks: [],
    };
  }

  return {
    tasks: value.tasks
      .map(normalizeAgentTaskState)
      .filter((task): task is AgentTaskState => task !== null)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  };
}

export async function listAgentInstances(): Promise<AgentInstance[]> {
  try {
    const raw = await readFile(getAgentInstancesIndexFilePath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;

    return normalizeAgentInstancesIndexFile(parsed).instances;
  } catch {
    return [];
  }
}

export async function saveAgentInstances(
  instances: AgentInstance[],
): Promise<void> {
  const filePath = getAgentInstancesIndexFilePath();

  await mkdir(dirname(filePath), { recursive: true });

  const normalizedInstances = instances
    .map(normalizeAgentInstance)
    .filter((instance): instance is AgentInstance => instance !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  await writeFile(
    filePath,
    JSON.stringify(
      {
        instances: normalizedInstances,
      },
      null,
      2,
    ),
    "utf8",
  );
}

export async function upsertAgentInstance(
  input: AgentInstance,
): Promise<AgentInstance> {
  const nextInstance = normalizeAgentInstance(input);

  if (!nextInstance) {
    throw new Error("Cannot persist invalid agent instance.");
  }

  const currentInstances = await listAgentInstances();

  await saveAgentInstances([
    nextInstance,
    ...currentInstances.filter(
      (instance) => instance.instanceId !== nextInstance.instanceId,
    ),
  ]);

  return nextInstance;
}

export async function readAgentInstance(
  instanceId: string,
): Promise<AgentInstance | null> {
  const normalizedInstanceId = instanceId.trim();

  if (!normalizedInstanceId) {
    return null;
  }

  const instances = await listAgentInstances();

  return (
    instances.find((instance) => instance.instanceId === normalizedInstanceId) ??
    null
  );
}

export async function listAgentTaskStates(): Promise<AgentTaskState[]> {
  try {
    const raw = await readFile(getAgentTaskStatesIndexFilePath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;

    return normalizeAgentTaskStatesIndexFile(parsed).tasks;
  } catch {
    return [];
  }
}

export async function saveAgentTaskStates(
  tasks: AgentTaskState[],
): Promise<void> {
  const filePath = getAgentTaskStatesIndexFilePath();

  await mkdir(dirname(filePath), { recursive: true });

  const normalizedTasks = tasks
    .map(normalizeAgentTaskState)
    .filter((task): task is AgentTaskState => task !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  await writeFile(
    filePath,
    JSON.stringify(
      {
        tasks: normalizedTasks,
      },
      null,
      2,
    ),
    "utf8",
  );
}

export async function upsertAgentTaskState(
  input: AgentTaskState,
): Promise<AgentTaskState> {
  const nextTask = normalizeAgentTaskState(input);

  if (!nextTask) {
    throw new Error("Cannot persist invalid agent task state.");
  }

  const currentTasks = await listAgentTaskStates();

  await saveAgentTaskStates([
    nextTask,
    ...currentTasks.filter((task) => task.taskId !== nextTask.taskId),
  ]);

  return nextTask;
}

export async function readAgentTaskState(
  taskId: string,
): Promise<AgentTaskState | null> {
  const normalizedTaskId = taskId.trim();

  if (!normalizedTaskId) {
    return null;
  }

  const tasks = await listAgentTaskStates();

  return tasks.find((task) => task.taskId === normalizedTaskId) ?? null;
}