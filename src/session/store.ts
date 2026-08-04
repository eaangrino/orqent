import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ResponseInputItem } from "../agent/protocol.js";

export type SessionState = {
  version: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  cwd: string;
  model: string;
  input: ResponseInputItem[];
};

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function createSessionId(): string {
  const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `session_${timestamp}_${randomUUID()}`;
}

export function createSession(cwd: string, model: string): SessionState {
  const now = new Date().toISOString();
  return {
    version: 1,
    id: createSessionId(),
    createdAt: now,
    updatedAt: now,
    cwd,
    model,
    input: [],
  };
}

export class SessionStore {
  readonly #directory: string;

  constructor(dataDir: string) {
    this.#directory = join(dataDir, "sessions");
  }

  pathFor(sessionId: string): string {
    return join(this.#directory, `${safeFileName(sessionId)}.json`);
  }

  async load(sessionId: string): Promise<SessionState> {
    const raw = await readFile(this.pathFor(sessionId), "utf8");
    const value = JSON.parse(raw) as unknown;
    return validateSession(value);
  }

  async save(session: SessionState): Promise<void> {
    await mkdir(this.#directory, { recursive: true });
    const path = this.pathFor(session.id);
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    const next: SessionState = {
      ...session,
      updatedAt: new Date().toISOString(),
      input: [...session.input],
    };
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    await rename(temporary, path);
    session.updatedAt = next.updatedAt;
  }
}

function validateSession(value: unknown): SessionState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("El archivo de sesión no contiene un objeto válido.");
  }
  const record = value as Record<string, unknown>;
  if (
    record.version !== 1 ||
    typeof record.id !== "string" ||
    typeof record.createdAt !== "string" ||
    typeof record.updatedAt !== "string" ||
    typeof record.cwd !== "string" ||
    typeof record.model !== "string" ||
    !Array.isArray(record.input)
  ) {
    throw new Error("El archivo de sesión tiene un formato incompatible.");
  }
  return {
    version: 1,
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    cwd: record.cwd,
    model: record.model,
    input: record.input as ResponseInputItem[],
  };
}
