import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import type {
  AgentInstance,
  AgentTaskState,
  CreateAgentInstanceInput,
  CreateAgentInstanceResult,
} from "./types.js";

function createTimestampId(prefix: string): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/\D/g, "")
    .slice(0, 14);

  return `${prefix}_${timestamp}_${randomUUID()}`;
}

export function createAgentInstanceId(): string {
  return createTimestampId("agent_instance");
}

export function createAgentTaskId(): string {
  return createTimestampId("agent_task");
}

function resolveCwd(cwd: string): string {
  try {
    return realpathSync(cwd).normalize("NFC");
  } catch {
    return cwd.normalize("NFC");
  }
}

function normalizeAllowedTools(allowedTools: string[]): string[] {
  return Array.from(
    new Set(
      allowedTools
        .map((toolName) => toolName.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

function normalizeNullableString(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function createAgentInstance({
  definition,
  parentSessionId,
  cwd,
  taskInput,
  modelOverride,
  metadata,
}: CreateAgentInstanceInput): CreateAgentInstanceResult {
  const normalizedParentSessionId = parentSessionId.trim();

  if (!normalizedParentSessionId) {
    throw new Error("parentSessionId cannot be empty.");
  }

  const normalizedTaskInput = taskInput.trim();

  if (!normalizedTaskInput) {
    throw new Error("taskInput cannot be empty.");
  }

  const instanceId = createAgentInstanceId();
  const taskId = createAgentTaskId();
  const now = new Date().toISOString();

  const effectiveModel =
    normalizeNullableString(modelOverride) ?? normalizeNullableString(definition.model);

  const instance: AgentInstance = {
    instanceId,
    taskId,
    parentSessionId: normalizedParentSessionId,
    agentIdentifier: definition.identifier,
    cwd: resolveCwd(cwd),
    model: effectiveModel,
    status: "created",
    systemPrompt: definition.systemPrompt,
    allowedTools: normalizeAllowedTools(definition.allowedTools),
    createdAt: now,
    updatedAt: now,
    metadata,
  };

  const taskState: AgentTaskState = {
    taskId,
    agentInstanceId: instanceId,
    parentSessionId: normalizedParentSessionId,
    agentIdentifier: definition.identifier,
    status: "queued",
    input: normalizedTaskInput,
    result: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    metadata,
  };

  return {
    instance,
    taskState,
  };
}

export function markAgentTaskRunning(
  taskState: AgentTaskState,
): AgentTaskState {
  const now = new Date().toISOString();

  return {
    ...taskState,
    status: "running",
    updatedAt: now,
    startedAt: taskState.startedAt ?? now,
  };
}

export function markAgentTaskCompleted(
  taskState: AgentTaskState,
  result: string,
): AgentTaskState {
  const now = new Date().toISOString();

  return {
    ...taskState,
    status: "completed",
    result,
    error: null,
    updatedAt: now,
    completedAt: now,
  };
}

export function markAgentTaskFailed(
  taskState: AgentTaskState,
  error: string,
): AgentTaskState {
  const now = new Date().toISOString();

  return {
    ...taskState,
    status: "failed",
    result: null,
    error,
    updatedAt: now,
    completedAt: now,
  };
}

export function markAgentTaskCancelled(
  taskState: AgentTaskState,
  reason: string,
): AgentTaskState {
  const now = new Date().toISOString();

  return {
    ...taskState,
    status: "cancelled",
    result: null,
    error: reason,
    updatedAt: now,
    completedAt: now,
  };
}

export function markAgentInstanceRunning(
  instance: AgentInstance,
): AgentInstance {
  return {
    ...instance,
    status: "running",
    updatedAt: new Date().toISOString(),
  };
}

export function markAgentInstanceCompleted(
  instance: AgentInstance,
): AgentInstance {
  return {
    ...instance,
    status: "completed",
    updatedAt: new Date().toISOString(),
  };
}

export function markAgentInstanceFailed(
  instance: AgentInstance,
): AgentInstance {
  return {
    ...instance,
    status: "failed",
    updatedAt: new Date().toISOString(),
  };
}

export function markAgentInstanceCancelled(
  instance: AgentInstance,
): AgentInstance {
  return {
    ...instance,
    status: "cancelled",
    updatedAt: new Date().toISOString(),
  };
}