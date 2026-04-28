import {
  createAgentInstance,
  getAgentDefinitionsFilePath,
  getAgentInstancesIndexFilePath,
  getAgentTaskStatesIndexFilePath,
  listAgentDefinitions,
  readAgentDefinition,
  upsertAgentDefinition,
  upsertAgentInstance,
  upsertAgentTaskState,
  listAgentTaskStates,
  type AgentDefinition,
  type AgentDefinitionInput,
  type AgentDefinitionScope,
  type AgentInstance,
  type AgentMemoryScope,
  type AgentTaskState,
} from "../../agents/index.js";
import type { PermissionMode } from "../../security/index.js";
import type { ToolDefinition, ToolValidationResult } from "../types.js";
import type {
  OllamaGenerationOptions,
  OllamaThinkingMode,
} from "../../models/ollama/index.js";

type AgentCreateDefinitionInput = {
  identifier: string;
  name: string;
  whenToUse: string;
  systemPrompt: string;
  allowedTools?: string[];
  model?: string | null;
  scope?: AgentDefinitionScope;
  memoryScope?: AgentMemoryScope;
  permissionMode?: PermissionMode;
};

export type AgentCreateDefinitionResult = {
  agent: AgentDefinition;
  filePath: string;
};

type AgentListDefinitionsInput = {
  identifier?: string;
};

type AgentDefinitionSummary = Omit<AgentDefinition, "systemPrompt" | "metadata">;

export type AgentListDefinitionsResult = {
  agents: AgentDefinitionSummary[];
  count: number;
  filePath: string;
};

type AgentSpawnInput = {
  agentIdentifier: string;
  taskInput: string;
  modelOverride?: string | null;
  executeNow?: boolean;
};

type AgentInstanceSummary = Omit<AgentInstance, "systemPrompt" | "metadata">;

export type AgentSpawnResult = {
  instance: AgentInstanceSummary;
  taskState: AgentTaskState;
  instanceFilePath: string;
  taskStateFilePath: string;
  execution:
  | {
    status: "stubbed";
    message: string;
  }
  | {
    status: "completed";
    response: string;
    model: string;
  }
  | {
    status: "failed";
    error: string;
  };
};

type AgentListTasksInput = {
  parentSessionId?: string;
  agentIdentifier?: string;
  status?: AgentTaskState[ "status" ];
};

export type AgentListTasksResult = {
  tasks: AgentTaskState[];
  count: number;
  filePath: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
): ToolValidationResult<string> {
  if (typeof value !== "string" || !value.trim()) {
    return {
      ok: false,
      error: `${fieldName} must be a non-empty string.`,
    };
  }

  return {
    ok: true,
    input: value.trim(),
  };
}

function normalizeOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  return value.trim() || null;
}

function normalizeAllowedTools(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

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

function normalizeScope(value: unknown): AgentDefinitionScope | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === "global" || value === "project") {
    return value;
  }

  return undefined;
}

function normalizeMemoryScope(value: unknown): AgentMemoryScope | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    value === "none" ||
    value === "session" ||
    value === "project" ||
    value === "global"
  ) {
    return value;
  }

  return undefined;
}

function normalizePermissionMode(value: unknown): PermissionMode | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === "ask" || value === "allow" || value === "deny") {
    return value;
  }

  return undefined;
}

function validateAgentCreateDefinitionInput(
  input: unknown,
): ToolValidationResult<AgentCreateDefinitionInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "input must be an object.",
    };
  }

  const identifier = normalizeRequiredString(input.identifier, "identifier");

  if (!identifier.ok) {
    return identifier;
  }

  const name = normalizeRequiredString(input.name, "name");

  if (!name.ok) {
    return name;
  }

  const whenToUse = normalizeRequiredString(input.whenToUse, "whenToUse");

  if (!whenToUse.ok) {
    return whenToUse;
  }

  const systemPrompt = normalizeRequiredString(
    input.systemPrompt,
    "systemPrompt",
  );

  if (!systemPrompt.ok) {
    return systemPrompt;
  }

  const normalizedInput: AgentCreateDefinitionInput = {
    identifier: identifier.input,
    name: name.input,
    whenToUse: whenToUse.input,
    systemPrompt: systemPrompt.input,
  };

  const allowedTools = normalizeAllowedTools(input.allowedTools);

  if (allowedTools !== undefined) {
    normalizedInput.allowedTools = allowedTools;
  }

  const model = normalizeOptionalString(input.model);

  if (model !== undefined) {
    normalizedInput.model = model;
  }

  const scope = normalizeScope(input.scope);

  if (scope !== undefined) {
    normalizedInput.scope = scope;
  }

  const memoryScope = normalizeMemoryScope(input.memoryScope);

  if (memoryScope !== undefined) {
    normalizedInput.memoryScope = memoryScope;
  }

  const permissionMode = normalizePermissionMode(input.permissionMode);

  if (permissionMode !== undefined) {
    normalizedInput.permissionMode = permissionMode;
  }

  return {
    ok: true,
    input: normalizedInput,
  };
}

function validateAgentListDefinitionsInput(
  input: unknown,
): ToolValidationResult<AgentListDefinitionsInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "input must be an object.",
    };
  }

  if (input.identifier === undefined) {
    return {
      ok: true,
      input: {},
    };
  }

  if (typeof input.identifier !== "string") {
    return {
      ok: false,
      error: "identifier must be a string when provided.",
    };
  }

  const identifier = input.identifier.trim().toLowerCase();

  if (!identifier) {
    return {
      ok: false,
      error: "identifier must not be empty when provided.",
    };
  }

  return {
    ok: true,
    input: {
      identifier,
    },
  };
}

function toAgentDefinitionSummary(
  agent: AgentDefinition,
): AgentDefinitionSummary {
  return {
    identifier: agent.identifier,
    name: agent.name,
    whenToUse: agent.whenToUse,
    allowedTools: agent.allowedTools,
    model: agent.model,
    scope: agent.scope,
    memoryScope: agent.memoryScope,
    permissionMode: agent.permissionMode,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  };
}

function isOllamaGenerationOptions(
  value: unknown,
): value is OllamaGenerationOptions {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.temperature === "number" &&
    typeof value.topP === "number" &&
    typeof value.topK === "number" &&
    typeof value.numCtx === "number" &&
    typeof value.numPredict === "number" &&
    typeof value.repeatPenalty === "number"
  );
}

function isOllamaThinkingMode(value: unknown): value is OllamaThinkingMode {
  return (
    value === "default" ||
    value === "disabled" ||
    value === "enabled" ||
    value === "low" ||
    value === "medium" ||
    value === "high"
  );
}

function normalizeRuntimeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function validateAgentSpawnInput(
  input: unknown,
): ToolValidationResult<AgentSpawnInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "input must be an object.",
    };
  }

  const agentIdentifier = normalizeRequiredString(
    input.agentIdentifier,
    "agentIdentifier",
  );

  if (!agentIdentifier.ok) {
    return agentIdentifier;
  }

  const taskInput = normalizeRequiredString(input.taskInput, "taskInput");

  if (!taskInput.ok) {
    return taskInput;
  }

  const normalizedInput: AgentSpawnInput = {
    agentIdentifier: agentIdentifier.input.toLowerCase(),
    taskInput: taskInput.input,
  };

  const modelOverride = normalizeOptionalString(input.modelOverride);

  if (modelOverride !== undefined) {
    normalizedInput.modelOverride = modelOverride;
  }

  if (input.executeNow !== undefined) {
    if (typeof input.executeNow !== "boolean") {
      return {
        ok: false,
        error: "executeNow must be a boolean when provided.",
      };
    }

    normalizedInput.executeNow = input.executeNow;
  }

  return {
    ok: true,
    input: normalizedInput,
  };
}

function toAgentInstanceSummary(
  instance: AgentInstance,
): AgentInstanceSummary {
  return {
    instanceId: instance.instanceId,
    taskId: instance.taskId,
    parentSessionId: instance.parentSessionId,
    agentIdentifier: instance.agentIdentifier,
    cwd: instance.cwd,
    model: instance.model,
    status: instance.status,
    allowedTools: instance.allowedTools,
    createdAt: instance.createdAt,
    updatedAt: instance.updatedAt,
  };
}

function validateAgentListTasksInput(
  input: unknown,
): ToolValidationResult<AgentListTasksInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "input must be an object.",
    };
  }

  const normalizedInput: AgentListTasksInput = {};

  if (input.parentSessionId !== undefined) {
    if (typeof input.parentSessionId !== "string") {
      return {
        ok: false,
        error: "parentSessionId must be a string when provided.",
      };
    }

    const parentSessionId = input.parentSessionId.trim();

    if (!parentSessionId) {
      return {
        ok: false,
        error: "parentSessionId must not be empty when provided.",
      };
    }

    normalizedInput.parentSessionId = parentSessionId;
  }

  if (input.agentIdentifier !== undefined) {
    if (typeof input.agentIdentifier !== "string") {
      return {
        ok: false,
        error: "agentIdentifier must be a string when provided.",
      };
    }

    const agentIdentifier = input.agentIdentifier.trim().toLowerCase();

    if (!agentIdentifier) {
      return {
        ok: false,
        error: "agentIdentifier must not be empty when provided.",
      };
    }

    normalizedInput.agentIdentifier = agentIdentifier;
  }

  if (input.status !== undefined) {
    if (
      input.status !== "queued" &&
      input.status !== "running" &&
      input.status !== "completed" &&
      input.status !== "failed" &&
      input.status !== "cancelled"
    ) {
      return {
        ok: false,
        error:
          'status must be one of "queued", "running", "completed", "failed", "cancelled".',
      };
    }

    normalizedInput.status = input.status;
  }

  return {
    ok: true,
    input: normalizedInput,
  };
}

// Export tools 

export const agentCreateDefinitionTool: ToolDefinition<
  AgentCreateDefinitionInput,
  AgentCreateDefinitionResult
> = {
  name: "agent.create_definition",
  description:
    "Create or update a persistent local agent definition. Use this only when the user explicitly wants to define, save, or update an agent.",
  inputSchema: {
    type: "object",
    properties: {
      executeNow: {
        type: "boolean",
        description:
          "When true, execute the subagent synchronously now. When false or omitted, only create persistent instance/task state.",
      },
      identifier: {
        type: "string",
        description:
          "Stable agent id. Use lowercase letters, numbers, dots, underscores or hyphens.",
      },
      name: {
        type: "string",
        description: "Human-readable agent name.",
      },
      whenToUse: {
        type: "string",
        description: "Clear rule describing when this agent should be used.",
      },
      systemPrompt: {
        type: "string",
        description: "System prompt used when this agent runs.",
      },
      allowedTools: {
        type: "array",
        items: {
          type: "string",
        },
        description:
          "Optional list of allowed tool names for this agent, for example filesystem.read or project.search.",
      },
      model: {
        type: [ "string", "null" ],
        description:
          "Optional model override. Null means inherit the active model.",
      },
      scope: {
        type: "string",
        enum: [ "global", "project" ],
      },
      memoryScope: {
        type: "string",
        enum: [ "none", "session", "project", "global" ],
      },
      permissionMode: {
        type: "string",
        enum: [ "ask", "allow", "deny" ],
      },
    },
    required: [ "identifier", "name", "whenToUse", "systemPrompt" ],
    additionalProperties: false,
  },
  risk: "medium",
  permissions: [ "agents:write" ],
  requiresConfirmation: true,
  isReadOnly: false,
  validateInput: validateAgentCreateDefinitionInput,
  async execute(input) {
    const agentInput: AgentDefinitionInput = {
      identifier: input.identifier,
      name: input.name,
      whenToUse: input.whenToUse,
      systemPrompt: input.systemPrompt,
      allowedTools: input.allowedTools,
      model: input.model,
      scope: input.scope,
      memoryScope: input.memoryScope,
      permissionMode: input.permissionMode,
    };

    const agent = await upsertAgentDefinition(agentInput);

    return {
      ok: true,
      result: {
        agent,
        filePath: getAgentDefinitionsFilePath(),
      },
    };
  },
};

export const agentListDefinitionsTool: ToolDefinition<
  AgentListDefinitionsInput,
  AgentListDefinitionsResult
> = {
  name: "agent.list_definitions",
  description:
    "List persistent local agent definitions. Optionally filter by exact identifier. This is read-only and does not expose agent system prompts.",
  inputSchema: {
    type: "object",
    properties: {
      identifier: {
        type: "string",
        description:
          "Optional exact agent identifier to filter by. Omit to list all agents.",
      },
    },
    additionalProperties: false,
  },
  risk: "low",
  permissions: [ "agents:read" ],
  requiresConfirmation: false,
  isReadOnly: true,
  validateInput: validateAgentListDefinitionsInput,
  async execute(input) {
    const agents = await listAgentDefinitions();

    const filteredAgents = input.identifier
      ? agents.filter((agent) => agent.identifier === input.identifier)
      : agents;

    const summaries = filteredAgents.map(toAgentDefinitionSummary);

    return {
      ok: true,
      result: {
        agents: summaries,
        count: summaries.length,
        filePath: getAgentDefinitionsFilePath(),
      },
    };
  },
};

export const agentSpawnTool: ToolDefinition<AgentSpawnInput, AgentSpawnResult> =
{
  name: "agent.spawn",
  description:
    "Create a persistent subagent instance and independent task state from an existing agent definition. This currently prepares the task but does not execute the subagent loop yet.",
  inputSchema: {
    type: "object",
    properties: {
      agentIdentifier: {
        type: "string",
        description:
          "Identifier of an existing persistent agent definition to spawn.",
      },
      taskInput: {
        type: "string",
        description:
          "Task or instruction that will be assigned to the subagent.",
      },
      modelOverride: {
        type: [ "string", "null" ],
        description:
          "Optional model override for this spawned agent instance. Null means use the agent definition model or inherit later.",
      },
    },
    required: [ "agentIdentifier", "taskInput" ],
    additionalProperties: false,
  },
  risk: "medium",
  permissions: [ "agents:write" ],
  requiresConfirmation: true,
  isReadOnly: false,
  validateInput: validateAgentSpawnInput,
  async execute(input, context) {
    const definition = await readAgentDefinition(input.agentIdentifier);

    if (!definition) {
      return {
        ok: false,
        error: {
          code: "agent_definition_not_found",
          message: `Agent definition "${input.agentIdentifier}" was not found.`,
        },
      };
    }

    if (!input.executeNow) {
      const { instance, taskState } = createAgentInstance({
        definition,
        parentSessionId: context.sessionId,
        cwd: context.cwd,
        taskInput: input.taskInput,
        modelOverride: input.modelOverride,
        metadata: {
          createdByTool: "agent.spawn",
        },
      });

      const persistedInstance = await upsertAgentInstance(instance);
      const persistedTaskState = await upsertAgentTaskState(taskState);

      return {
        ok: true,
        result: {
          instance: toAgentInstanceSummary(persistedInstance),
          taskState: persistedTaskState,
          instanceFilePath: getAgentInstancesIndexFilePath(),
          taskStateFilePath: getAgentTaskStatesIndexFilePath(),
          execution: {
            status: "stubbed",
            message:
              "Agent instance and task state were persisted. Subagent execution was not requested.",
          },
        },
      };
    }

    const ollamaHost = normalizeRuntimeString(context.runtime?.ollamaHost);
    const activeModel = normalizeRuntimeString(context.runtime?.activeModel);

    if (!ollamaHost) {
      return {
        ok: false,
        error: {
          code: "agent_spawn_missing_ollama_host",
          message:
            "agent.spawn executeNow=true requires runtime.ollamaHost.",
        },
      };
    }

    const generationOptions = isOllamaGenerationOptions(
      context.runtime?.generationOptions,
    )
      ? context.runtime.generationOptions
      : undefined;

    const thinkingMode = isOllamaThinkingMode(context.runtime?.thinkingMode)
      ? context.runtime.thinkingMode
      : undefined;

    const { runSubagentTask } = await import("../../runtime/subagent-runner.js");

    const executionResult = await runSubagentTask({
      definition,
      parentSessionId: context.sessionId,
      cwd: context.cwd,
      taskInput: input.taskInput,
      host: ollamaHost,
      fallbackModel: activeModel,
      modelOverride: input.modelOverride,
      generationOptions,
      thinkingMode,
      metadata: {
        createdByTool: "agent.spawn",
        executeNow: true,
      },
    });

    return {
      ok: true,
      result: {
        instance: toAgentInstanceSummary(executionResult.instance),
        taskState: executionResult.taskState,
        instanceFilePath: getAgentInstancesIndexFilePath(),
        taskStateFilePath: getAgentTaskStatesIndexFilePath(),
        execution: executionResult.ok
          ? {
            status: "completed",
            response: executionResult.response,
            model: executionResult.model,
          }
          : {
            status: "failed",
            error: executionResult.error,
          },
      },
    };
  },
};

export const agentListTasksTool: ToolDefinition<
  AgentListTasksInput,
  AgentListTasksResult
> = {
  name: "agent.list_tasks",
  description:
    "List persistent subagent task states. Optionally filter by parentSessionId, agentIdentifier, or task status.",
  inputSchema: {
    type: "object",
    properties: {
      parentSessionId: {
        type: "string",
        description: "Optional parent chat session id to filter tasks.",
      },
      agentIdentifier: {
        type: "string",
        description: "Optional agent identifier to filter tasks.",
      },
      status: {
        type: "string",
        enum: [ "queued", "running", "completed", "failed", "cancelled" ],
        description: "Optional task status filter.",
      },
    },
    additionalProperties: false,
  },
  risk: "low",
  permissions: [ "agents:read" ],
  requiresConfirmation: false,
  isReadOnly: true,
  validateInput: validateAgentListTasksInput,
  async execute(input) {
    const tasks = await listAgentTaskStates();

    const filteredTasks = tasks.filter((task) => {
      if (
        input.parentSessionId !== undefined &&
        task.parentSessionId !== input.parentSessionId
      ) {
        return false;
      }

      if (
        input.agentIdentifier !== undefined &&
        task.agentIdentifier !== input.agentIdentifier
      ) {
        return false;
      }

      if (input.status !== undefined && task.status !== input.status) {
        return false;
      }

      return true;
    });

    return {
      ok: true,
      result: {
        tasks: filteredTasks,
        count: filteredTasks.length,
        filePath: getAgentTaskStatesIndexFilePath(),
      },
    };
  },
};