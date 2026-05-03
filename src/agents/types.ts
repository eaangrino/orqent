import type { PermissionMode } from "../security/index.js";

export type AgentDefinitionScope = "global" | "project";

export type AgentMemoryScope = "none" | "session" | "project" | "global";

export type AgentDefinitionInput = {
  identifier: string;
  name: string;
  whenToUse: string;
  systemPrompt: string;
  allowedTools?: string[];
  model?: string | null;
  scope?: AgentDefinitionScope;
  memoryScope?: AgentMemoryScope;
  permissionMode?: PermissionMode;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
};

export type AgentDefinition = {
  identifier: string;
  name: string;
  whenToUse: string;
  systemPrompt: string;
  allowedTools: string[];
  model: string | null;
  scope: AgentDefinitionScope;
  memoryScope: AgentMemoryScope;
  permissionMode: PermissionMode;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
};

export type AgentDefinitionsFile = {
  agents: AgentDefinition[];
};

export type AgentInstanceStatus =
  | "created"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentTaskStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentTaskState = {
  taskId: string;
  agentInstanceId: string;
  parentSessionId: string;
  agentIdentifier: string;
  status: AgentTaskStatus;
  input: string;
  result: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  metadata?: Record<string, unknown>;
};

export type AgentInstance = {
  instanceId: string;
  taskId: string;
  parentSessionId: string;
  agentIdentifier: string;
  cwd: string;
  model: string | null;
  status: AgentInstanceStatus;
  systemPrompt: string;
  allowedTools: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
};

export type CreateAgentInstanceInput = {
  definition: AgentDefinition;
  parentSessionId: string;
  cwd: string;
  taskInput: string;
  modelOverride?: string | null;
  metadata?: Record<string, unknown>;
};

export type CreateAgentInstanceResult = {
  instance: AgentInstance;
  taskState: AgentTaskState;
};

export type AgentTranscriptRole = "system" | "user" | "assistant";

export type AgentTranscriptEntryInput = {
  role: AgentTranscriptRole;
  content: string;
  model?: string | null;
  metadata?: Record<string, unknown>;
};

export type AgentTranscriptEntry = AgentTranscriptEntryInput & {
  id: string;
  instanceId: string;
  taskId: string;
  parentSessionId: string;
  agentIdentifier: string;
  createdAt: string;
};

export type AgentBackgroundTaskStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentBackgroundTaskState = {
  backgroundTaskId: string;
  taskId: string;
  agentInstanceId: string;
  parentSessionId: string;
  agentIdentifier: string;
  cwd: string;
  status: AgentBackgroundTaskStatus;
  input: string;
  result: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  lastHeartbeatAt: string | null;
  metadata?: Record<string, unknown>;
};