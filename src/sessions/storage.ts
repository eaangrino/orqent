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