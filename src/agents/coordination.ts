import {
  listAgentBackgroundTasks,
  listAgentInstances,
  listAgentTaskStates,
  readAgentTranscriptEntries,
} from "./index.js";
import type {
  AgentBackgroundTaskState,
  AgentInstance,
  AgentTaskState,
  AgentTranscriptEntry,
} from "./types.js";

export type AgentChildTaskSnapshot = {
  parentSessionId: string;
  agentIdentifier: string;
  instanceId: string;
  taskId: string;
  status: {
    instance: AgentInstance[ "status" ];
    task: AgentTaskState[ "status" ] | null;
    background: AgentBackgroundTaskState[ "status" ] | null;
  };
  input: string | null;
  result: string | null;
  error: string | null;
  instance: AgentInstance;
  taskState: AgentTaskState | null;
  backgroundTask: AgentBackgroundTaskState | null;
  transcript: AgentTranscriptEntry[];
};

export type ListAgentChildTaskSnapshotsInput = {
  parentSessionId: string;
  includeTranscript?: boolean;
};

function normalizeRequiredString(value: string, name: string): string {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(`${name} cannot be empty.`);
  }

  return normalizedValue;
}

function pickResult({
  taskState,
  backgroundTask,
}: {
  taskState: AgentTaskState | null;
  backgroundTask: AgentBackgroundTaskState | null;
}): string | null {
  return backgroundTask?.result ?? taskState?.result ?? null;
}

function pickError({
  taskState,
  backgroundTask,
}: {
  taskState: AgentTaskState | null;
  backgroundTask: AgentBackgroundTaskState | null;
}): string | null {
  return backgroundTask?.error ?? taskState?.error ?? null;
}

function pickInput({
  taskState,
  backgroundTask,
}: {
  taskState: AgentTaskState | null;
  backgroundTask: AgentBackgroundTaskState | null;
}): string | null {
  return taskState?.input ?? backgroundTask?.input ?? null;
}

function sortSnapshotsByUpdatedAt(
  snapshots: AgentChildTaskSnapshot[],
): AgentChildTaskSnapshot[] {
  return snapshots.sort((left, right) => {
    const leftUpdatedAt =
      left.backgroundTask?.updatedAt ??
      left.taskState?.updatedAt ??
      left.instance.updatedAt;

    const rightUpdatedAt =
      right.backgroundTask?.updatedAt ??
      right.taskState?.updatedAt ??
      right.instance.updatedAt;

    return rightUpdatedAt.localeCompare(leftUpdatedAt);
  });
}

export async function listAgentChildTaskSnapshots({
  parentSessionId,
  includeTranscript = false,
}: ListAgentChildTaskSnapshotsInput): Promise<AgentChildTaskSnapshot[]> {
  const normalizedParentSessionId = normalizeRequiredString(
    parentSessionId,
    "parentSessionId",
  );

  const [ instances, taskStates, backgroundTasks ] = await Promise.all([
    listAgentInstances(),
    listAgentTaskStates(),
    listAgentBackgroundTasks(),
  ]);

  const tasksById = new Map(
    taskStates
      .filter((task) => task.parentSessionId === normalizedParentSessionId)
      .map((task) => [ task.taskId, task ]),
  );

  const backgroundTasksByInstanceId = new Map(
    backgroundTasks
      .filter((task) => task.parentSessionId === normalizedParentSessionId)
      .map((task) => [ task.agentInstanceId, task ]),
  );

  const childInstances = instances.filter(
    (instance) => instance.parentSessionId === normalizedParentSessionId,
  );

  const snapshots = await Promise.all(
    childInstances.map(async (instance): Promise<AgentChildTaskSnapshot> => {
      const taskState = tasksById.get(instance.taskId) ?? null;
      const backgroundTask =
        backgroundTasksByInstanceId.get(instance.instanceId) ?? null;

      const transcript = includeTranscript
        ? await readAgentTranscriptEntries(instance.instanceId)
        : [];

      return {
        parentSessionId: normalizedParentSessionId,
        agentIdentifier: instance.agentIdentifier,
        instanceId: instance.instanceId,
        taskId: instance.taskId,
        status: {
          instance: instance.status,
          task: taskState?.status ?? null,
          background: backgroundTask?.status ?? null,
        },
        input: pickInput({
          taskState,
          backgroundTask,
        }),
        result: pickResult({
          taskState,
          backgroundTask,
        }),
        error: pickError({
          taskState,
          backgroundTask,
        }),
        instance,
        taskState,
        backgroundTask,
        transcript,
      };
    }),
  );

  return sortSnapshotsByUpdatedAt(snapshots);
}