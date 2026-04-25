import { appendFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type TranscriptRole = "user" | "assistant" | "system";

export type TranscriptEntryInput = {
  role: TranscriptRole;
  content: string;
  model?: string | null;
  metadata?: Record<string, unknown>;
};

export type TranscriptEntry = TranscriptEntryInput & {
  id: string;
  sessionId: string;
  createdAt: string;
};

export type ToolActionEntryInput = {
  toolName: string;
  cwd: string;
  input: unknown;
  status: string;
  ok: boolean;
  durationMs: number;
  risk?: string;
  permissions?: string[];
  requiresConfirmation?: boolean;
  isReadOnly?: boolean;
  permissionEffect?: string;
  permissionReason?: string;
  confirmation?: string;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
};

export type ToolActionEntry = ToolActionEntryInput & {
  id: string;
  sessionId: string;
  createdAt: string;
};

function resolveDataDir() {
  const customDir = process.env.ORQENT_DATA_DIR?.trim();

  if (customDir) {
    return customDir;
  }

  return join(homedir(), ".orqent");
}

function toSafeSessionFileName(sessionId: string) {
  return sessionId.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function createSessionId() {
  const timestamp = new Date()
    .toISOString()
    .replace(/\D/g, "")
    .slice(0, 14);

  return `session_${timestamp}_${randomUUID()}`;
}

export function getTranscriptFilePath(sessionId: string) {
  return join(resolveDataDir(), "sessions", `${toSafeSessionFileName(sessionId)}.jsonl`);
}

export function getToolActionsFilePath(sessionId: string) {
  return join(
    resolveDataDir(),
    "sessions",
    `${toSafeSessionFileName(sessionId)}.tools.jsonl`,
  );
}

export async function appendTranscriptEntry(
  sessionId: string,
  entry: TranscriptEntryInput,
): Promise<TranscriptEntry> {
  const transcriptFile = getTranscriptFilePath(sessionId);

  await mkdir(dirname(transcriptFile), { recursive: true });

  const transcriptEntry: TranscriptEntry = {
    id: randomUUID(),
    sessionId,
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

export async function appendToolActionEntry(
  sessionId: string,
  entry: ToolActionEntryInput,
): Promise<ToolActionEntry> {
  const toolActionsFile = getToolActionsFilePath(sessionId);

  await mkdir(dirname(toolActionsFile), { recursive: true });

  const toolActionEntry: ToolActionEntry = {
    id: randomUUID(),
    sessionId,
    createdAt: new Date().toISOString(),
    ...entry,
  };

  await appendFile(
    toolActionsFile,
    `${JSON.stringify(toolActionEntry)}\n`,
    "utf8",
  );

  return toolActionEntry;
}