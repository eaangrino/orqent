import {
  listAgentDefinitions,
  markAgentBackgroundTaskCompleted,
  markAgentBackgroundTaskFailed,
  markAgentBackgroundTaskRunning,
  readAgentBackgroundTask,
  readAgentInstance,
  readAgentTaskState,
  upsertAgentBackgroundTask,
  type AgentBackgroundTaskState,
  type AgentInstance,
  type AgentTaskState,
} from "../agents/index.js";
import type {
  OllamaGenerationOptions,
  OllamaThinkingMode,
} from "../models/ollama/index.js";
import {
  executeSubagentInstanceTask,
  type SubagentChatRunner,
} from "./subagent-runner.js";

export type RunQueuedBackgroundTaskInput = {
  backgroundTaskId: string;
  host: string;
  fallbackModel: string | null;
  generationOptions?: OllamaGenerationOptions;
  thinkingMode?: OllamaThinkingMode;
  chatRunner?: SubagentChatRunner;
};

export type RunQueuedBackgroundTaskResult =
  | {
    ok: true;
    backgroundTask: AgentBackgroundTaskState;
    instance: AgentInstance;
    taskState: AgentTaskState;
    response: string;
    model: string;
  }
  | {
    ok: false;
    backgroundTask: AgentBackgroundTaskState | null;
    instance: AgentInstance | null;
    taskState: AgentTaskState | null;
    error: string;
  };

function normalizeBackgroundTaskId(value: string): string {
  return value.trim();
}

async function failBackgroundTask({
  backgroundTask,
  instance,
  taskState,
  error,
}: {
  backgroundTask: AgentBackgroundTaskState | null;
  instance: AgentInstance | null;
  taskState: AgentTaskState | null;
  error: string;
}): Promise<RunQueuedBackgroundTaskResult> {
  if (backgroundTask) {
    await upsertAgentBackgroundTask(
      markAgentBackgroundTaskFailed(backgroundTask, error),
    );
  }

  return {
    ok: false,
    backgroundTask: backgroundTask
      ? markAgentBackgroundTaskFailed(backgroundTask, error)
      : null,
    instance,
    taskState,
    error,
  };
}

export async function runQueuedBackgroundTask({
  backgroundTaskId,
  host,
  fallbackModel,
  generationOptions,
  thinkingMode,
  chatRunner,
}: RunQueuedBackgroundTaskInput): Promise<RunQueuedBackgroundTaskResult> {
  const normalizedBackgroundTaskId =
    normalizeBackgroundTaskId(backgroundTaskId);

  if (!normalizedBackgroundTaskId) {
    return {
      ok: false,
      backgroundTask: null,
      instance: null,
      taskState: null,
      error: "backgroundTaskId cannot be empty.",
    };
  }

  let backgroundTask = await readAgentBackgroundTask(
    normalizedBackgroundTaskId,
  );

  if (!backgroundTask) {
    return {
      ok: false,
      backgroundTask: null,
      instance: null,
      taskState: null,
      error: `Background task "${normalizedBackgroundTaskId}" was not found.`,
    };
  }

  const instance = await readAgentInstance(backgroundTask.agentInstanceId);
  const taskState = await readAgentTaskState(backgroundTask.taskId);

  if (!instance || !taskState) {
    return failBackgroundTask({
      backgroundTask,
      instance,
      taskState,
      error:
        "Background task is missing its linked agent instance or task state.",
    });
  }

  if (backgroundTask.status !== "queued") {
    return {
      ok: false,
      backgroundTask,
      instance,
      taskState,
      error: `Background task "${backgroundTask.backgroundTaskId}" is not queued. Current status: ${backgroundTask.status}.`,
    };
  }

  const agentIdentifier = backgroundTask.agentIdentifier;
  const definitions = await listAgentDefinitions();
  const definition =
    definitions.find((agent) => agent.identifier === agentIdentifier) ?? null;

  if (!definition) {
    return failBackgroundTask({
      backgroundTask,
      instance,
      taskState,
      error: `Agent definition "${agentIdentifier}" was not found.`,
    });
  }

  backgroundTask = await upsertAgentBackgroundTask(
    markAgentBackgroundTaskRunning(backgroundTask),
  );

  const result = await executeSubagentInstanceTask({
    definition,
    instance,
    taskState,
    host,
    fallbackModel,
    modelOverride: instance.model,
    generationOptions,
    thinkingMode,
    chatRunner,
    metadata: {
      ...backgroundTask.metadata,
      backgroundTaskId: backgroundTask.backgroundTaskId,
      runInBackground: true,
      executedBy: "background-task-runner",
    },
  });

  if (!result.ok) {
    const failedBackgroundTask = await upsertAgentBackgroundTask(
      markAgentBackgroundTaskFailed(backgroundTask, result.error),
    );

    return {
      ok: false,
      backgroundTask: failedBackgroundTask,
      instance: result.instance,
      taskState: result.taskState,
      error: result.error,
    };
  }

  const completedBackgroundTask = await upsertAgentBackgroundTask(
    markAgentBackgroundTaskCompleted(backgroundTask, result.response),
  );

  return {
    ok: true,
    backgroundTask: completedBackgroundTask,
    instance: result.instance,
    taskState: result.taskState,
    response: result.response,
    model: result.model,
  };
}