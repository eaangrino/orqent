import {
  appendAgentTranscriptEntry,
  createAgentInstance,
  markAgentInstanceCompleted,
  markAgentInstanceFailed,
  markAgentInstanceRunning,
  markAgentTaskCompleted,
  markAgentTaskFailed,
  markAgentTaskRunning,
  upsertAgentInstance,
  upsertAgentTaskState,
  type AgentDefinition,
  type AgentInstance,
  type AgentTaskState,
} from "../agents/index.js";
import type {
  OllamaGenerationOptions,
  OllamaThinkingMode,
} from "../models/ollama/index.js";
import {
  streamChatFromOllama,
  type OllamaChatMessage,
  type SendPromptToOllamaResult,
} from "./ollama-runtime.js";

export type SubagentChatRunnerInput = {
  host: string;
  model: string;
  messages: OllamaChatMessage[];
  generationOptions?: OllamaGenerationOptions;
  thinkingMode?: OllamaThinkingMode;
};

export type SubagentChatRunner = (
  input: SubagentChatRunnerInput,
) => Promise<SendPromptToOllamaResult>;

export type RunSubagentTaskInput = {
  definition: AgentDefinition;
  parentSessionId: string;
  cwd: string;
  taskInput: string;
  host: string;
  fallbackModel: string | null;
  modelOverride?: string | null;
  generationOptions?: OllamaGenerationOptions;
  thinkingMode?: OllamaThinkingMode;
  chatRunner?: SubagentChatRunner;
  metadata?: Record<string, unknown>;
};

export type RunSubagentTaskResult =
  | {
    ok: true;
    instance: AgentInstance;
    taskState: AgentTaskState;
    response: string;
    model: string;
  }
  | {
    ok: false;
    instance: AgentInstance;
    taskState: AgentTaskState;
    error: string;
  };

export type ExecuteSubagentInstanceTaskInput = {
  definition: AgentDefinition;
  instance: AgentInstance;
  taskState: AgentTaskState;
  host: string;
  fallbackModel: string | null;
  modelOverride?: string | null;
  generationOptions?: OllamaGenerationOptions;
  thinkingMode?: OllamaThinkingMode;
  chatRunner?: SubagentChatRunner;
  metadata?: Record<string, unknown>;
};

export type ExecuteSubagentInstanceTaskResult = RunSubagentTaskResult;

function normalizeNullableString(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveEffectiveModel({
  modelOverride,
  definitionModel,
  fallbackModel,
}: {
  modelOverride?: string | null;
  definitionModel: string | null;
  fallbackModel: string | null;
}): string | null {
  return (
    normalizeNullableString(modelOverride) ??
    normalizeNullableString(definitionModel) ??
    normalizeNullableString(fallbackModel)
  );
}

export function buildSubagentSystemPrompt(instance: AgentInstance): string {
  return [
    "You are running as an isolated Orqent subagent.",
    "",
    "Subagent identity:",
    `- Agent identifier: ${instance.agentIdentifier}`,
    `- Agent instance id: ${instance.instanceId}`,
    `- Parent session id: ${instance.parentSessionId}`,
    `- Working directory: ${instance.cwd}`,
    "",
    "Isolation rules:",
    "- Work only on the task assigned to this subagent.",
    "- Do not assume access to the parent conversation history unless it is explicitly included in the task.",
    "- Do not claim that files, commands, tools, or external systems were inspected unless the runtime provides real tool results.",
    "- This runner currently performs a direct model call without internal subagent tool calling.",
    "",
    "Intended tool boundary for future subagent tool calling:",
    JSON.stringify(instance.allowedTools, null, 2),
    "",
    "Agent system prompt:",
    instance.systemPrompt,
  ].join("\n");
}

async function defaultSubagentChatRunner({
  host,
  model,
  messages,
  generationOptions,
  thinkingMode,
}: SubagentChatRunnerInput): Promise<SendPromptToOllamaResult> {
  return streamChatFromOllama({
    host,
    model,
    messages,
    generationOptions,
    thinkingMode,
    onToken: () => {
      // Subagent runner is synchronous for now. Streaming can be surfaced later.
    },
  });
}

export async function executeSubagentInstanceTask({
  definition,
  instance,
  taskState,
  host,
  fallbackModel,
  modelOverride,
  generationOptions,
  thinkingMode,
  chatRunner = defaultSubagentChatRunner,
  metadata,
}: ExecuteSubagentInstanceTaskInput): Promise<ExecuteSubagentInstanceTaskResult> {
  const effectiveModel = resolveEffectiveModel({
    modelOverride,
    definitionModel: definition.model,
    fallbackModel,
  });

  let nextInstance: AgentInstance = {
    ...instance,
    model: effectiveModel,
    metadata: {
      ...(instance.metadata ?? {}),
      ...(metadata ?? {}),
    },
  };

  let nextTaskState: AgentTaskState = {
    ...taskState,
    metadata: {
      ...(taskState.metadata ?? {}),
      ...(metadata ?? {}),
    },
  };

  await upsertAgentInstance(nextInstance);
  await upsertAgentTaskState(nextTaskState);

  nextInstance = markAgentInstanceRunning(nextInstance);
  nextTaskState = markAgentTaskRunning(nextTaskState);

  await upsertAgentInstance(nextInstance);
  await upsertAgentTaskState(nextTaskState);

  try {
    const subagentSystemPrompt = buildSubagentSystemPrompt(nextInstance);

    await appendAgentTranscriptEntry(nextInstance, {
      role: "system",
      content: subagentSystemPrompt,
      model: effectiveModel,
      metadata: {
        type: "subagent_system_prompt",
      },
    });

    await appendAgentTranscriptEntry(nextInstance, {
      role: "user",
      content: nextTaskState.input,
      model: effectiveModel,
      metadata: {
        type: "subagent_task_input",
      },
    });

    if (!effectiveModel) {
      throw new Error("No model available for subagent execution.");
    }

    const result = await chatRunner({
      host,
      model: effectiveModel,
      generationOptions,
      thinkingMode,
      messages: [
        {
          role: "system",
          content: subagentSystemPrompt,
        },
        {
          role: "user",
          content: nextTaskState.input,
        },
      ],
    });

    const response = result.response.trim() || "(empty subagent response)";

    nextInstance = markAgentInstanceCompleted(nextInstance);
    nextTaskState = markAgentTaskCompleted(nextTaskState, response);

    await upsertAgentInstance(nextInstance);
    await upsertAgentTaskState(nextTaskState);

    await appendAgentTranscriptEntry(nextInstance, {
      role: "assistant",
      content: response,
      model: result.model,
      metadata: {
        type: "subagent_response",
      },
    });

    return {
      ok: true,
      instance: nextInstance,
      taskState: nextTaskState,
      response,
      model: result.model,
    };
  } catch (error_) {
    const message =
      error_ instanceof Error
        ? error_.message
        : "Unknown subagent execution error.";

    nextInstance = markAgentInstanceFailed(nextInstance);
    nextTaskState = markAgentTaskFailed(nextTaskState, message);

    await upsertAgentInstance(nextInstance);
    await upsertAgentTaskState(nextTaskState);

    await appendAgentTranscriptEntry(nextInstance, {
      role: "assistant",
      content: `Error: ${message}`,
      model: effectiveModel,
      metadata: {
        type: "subagent_error",
        error: true,
      },
    });

    return {
      ok: false,
      instance: nextInstance,
      taskState: nextTaskState,
      error: message,
    };
  }
}

export async function runSubagentTask({
  definition,
  parentSessionId,
  cwd,
  taskInput,
  host,
  fallbackModel,
  modelOverride,
  generationOptions,
  thinkingMode,
  chatRunner = defaultSubagentChatRunner,
  metadata,
}: RunSubagentTaskInput): Promise<RunSubagentTaskResult> {
  const effectiveModel = resolveEffectiveModel({
    modelOverride,
    definitionModel: definition.model,
    fallbackModel,
  });

  const { instance, taskState } = createAgentInstance({
    definition,
    parentSessionId,
    cwd,
    taskInput,
    modelOverride: effectiveModel,
    metadata,
  });

  return executeSubagentInstanceTask({
    definition,
    instance,
    taskState,
    host,
    fallbackModel,
    modelOverride: effectiveModel,
    generationOptions,
    thinkingMode,
    chatRunner,
    metadata,
  });
}