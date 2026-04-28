import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type {
  AgentInstance,
  AgentTranscriptEntry,
  AgentTranscriptEntryInput,
  AgentTranscriptRole,
} from "./types.js";

function resolveDataDir() {
  const customDir = process.env.ORQENT_DATA_DIR?.trim();

  if (customDir) {
    return customDir;
  }

  return join(homedir(), ".orqent");
}

function toSafeAgentInstanceFileName(instanceId: string) {
  return instanceId.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function getAgentTranscriptFilePath(instanceId: string) {
  return join(
    resolveDataDir(),
    "agents",
    "transcripts",
    `${toSafeAgentInstanceFileName(instanceId)}.jsonl`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTranscriptRole(value: unknown): AgentTranscriptRole | null {
  if (value === "system" || value === "user" || value === "assistant") {
    return value;
  }

  return null;
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeAgentTranscriptEntry(
  value: unknown,
): AgentTranscriptEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const role = normalizeTranscriptRole(value.role);

  if (!role) {
    return null;
  }

  if (
    typeof value.id !== "string" ||
    !value.id.trim() ||
    typeof value.instanceId !== "string" ||
    !value.instanceId.trim() ||
    typeof value.taskId !== "string" ||
    !value.taskId.trim() ||
    typeof value.parentSessionId !== "string" ||
    !value.parentSessionId.trim() ||
    typeof value.agentIdentifier !== "string" ||
    !value.agentIdentifier.trim() ||
    typeof value.content !== "string" ||
    typeof value.createdAt !== "string"
  ) {
    return null;
  }

  const createdAt = new Date(value.createdAt);

  if (Number.isNaN(createdAt.getTime())) {
    return null;
  }

  return {
    id: value.id,
    instanceId: value.instanceId,
    taskId: value.taskId,
    parentSessionId: value.parentSessionId,
    agentIdentifier: value.agentIdentifier,
    createdAt: createdAt.toISOString(),
    role,
    content: value.content,
    model: normalizeNullableString(value.model),
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
  };
}

export async function appendAgentTranscriptEntry(
  instance: AgentInstance,
  entry: AgentTranscriptEntryInput,
): Promise<AgentTranscriptEntry> {
  const transcriptFile = getAgentTranscriptFilePath(instance.instanceId);

  await mkdir(dirname(transcriptFile), {
    recursive: true,
  });

  const transcriptEntry: AgentTranscriptEntry = {
    id: randomUUID(),
    instanceId: instance.instanceId,
    taskId: instance.taskId,
    parentSessionId: instance.parentSessionId,
    agentIdentifier: instance.agentIdentifier,
    createdAt: new Date().toISOString(),
    ...entry,
  };

  await appendFile(
    transcriptFile,
    `${JSON.stringify(transcriptEntry)}\n`,
    "utf8",
  );

  return transcriptEntry;
}

export async function readAgentTranscriptEntries(
  instanceId: string,
): Promise<AgentTranscriptEntry[]> {
  try {
    const raw = await readFile(getAgentTranscriptFilePath(instanceId), "utf8");

    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as unknown;
        } catch {
          return null;
        }
      })
      .map(normalizeAgentTranscriptEntry)
      .filter((entry): entry is AgentTranscriptEntry => entry !== null);
  } catch {
    return [];
  }
}