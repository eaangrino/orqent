import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
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

export type ChatSessionMetadataInput = {
  id: string;
  title?: string;
  cwd: string;
  model?: string | null;
  messageCount?: number;
  lastMessagePreview?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ChatSessionMetadata = {
  id: string;
  title: string;
  cwd: string;
  model: string | null;
  messageCount: number;
  lastMessagePreview: string | null;
  createdAt: string;
  updatedAt: string;
};

type ChatSessionIndexFile = {
  sessions: ChatSessionMetadata[];
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

export function getChatSessionIndexFilePath() {
  return join(resolveDataDir(), "sessions", "index.json");
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

function normalizeNonNegativeInteger(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.round(value));
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

function createDefaultSessionTitle(sessionId: string): string {
  return sessionId;
}

function normalizeChatSessionMetadata(
  value: unknown,
): ChatSessionMetadata | null {
  if (!isRecord(value)) {
    return null;
  }

  const now = new Date().toISOString();
  const id = normalizeString(value.id, "");

  if (!id) {
    return null;
  }

  const createdAt = normalizeIsoDate(value.createdAt, now);
  const updatedAt = normalizeIsoDate(value.updatedAt, createdAt);

  return {
    id,
    title: normalizeString(value.title, createDefaultSessionTitle(id)),
    cwd: normalizeString(value.cwd, process.cwd()),
    model: normalizeNullableString(value.model),
    messageCount: normalizeNonNegativeInteger(value.messageCount, 0),
    lastMessagePreview: normalizeNullableString(value.lastMessagePreview),
    createdAt,
    updatedAt,
  };
}

function normalizeChatSessionIndexFile(value: unknown): ChatSessionIndexFile {
  if (!isRecord(value) || !Array.isArray(value.sessions)) {
    return {
      sessions: [],
    };
  }

  return {
    sessions: value.sessions
      .map(normalizeChatSessionMetadata)
      .filter((session): session is ChatSessionMetadata => session !== null),
  };
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

export async function listChatSessionMetadata(): Promise<ChatSessionMetadata[]> {
  try {
    const raw = await readFile(getChatSessionIndexFilePath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const indexFile = normalizeChatSessionIndexFile(parsed);

    return indexFile.sessions.sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  } catch {
    return [];
  }
}

export async function saveChatSessionMetadataIndex(
  sessions: ChatSessionMetadata[],
): Promise<void> {
  const indexFile = getChatSessionIndexFilePath();

  await mkdir(dirname(indexFile), { recursive: true });

  const normalizedSessions = sessions
    .map(normalizeChatSessionMetadata)
    .filter((session): session is ChatSessionMetadata => session !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  await writeFile(
    indexFile,
    JSON.stringify(
      {
        sessions: normalizedSessions,
      },
      null,
      2,
    ),
    "utf8",
  );
}

export async function upsertChatSessionMetadata(
  input: ChatSessionMetadataInput,
): Promise<ChatSessionMetadata> {
  const currentSessions = await listChatSessionMetadata();
  const existingSession = currentSessions.find(
    (session) => session.id === input.id,
  );

  const now = new Date().toISOString();

  const nextSession = normalizeChatSessionMetadata({
    ...existingSession,
    ...input,
    title:
      input.title ??
      existingSession?.title ??
      createDefaultSessionTitle(input.id),
    createdAt: existingSession?.createdAt ?? input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  });

  if (!nextSession) {
    throw new Error("Cannot persist chat session metadata without session id.");
  }

  await saveChatSessionMetadataIndex([
    nextSession,
    ...currentSessions.filter((session) => session.id !== input.id),
  ]);

  return nextSession;
}