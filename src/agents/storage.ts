import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type {
  AgentDefinition,
  AgentDefinitionInput,
  AgentDefinitionScope,
  AgentDefinitionsFile,
  AgentMemoryScope,
} from "./types.js";
import type { PermissionMode } from "../security/index.js";

function resolveDataDir() {
  const customDir = process.env.ORQENT_DATA_DIR?.trim();

  if (customDir) {
    return customDir;
  }

  return join(homedir(), ".orqent");
}

export function getAgentDefinitionsFilePath() {
  return join(resolveDataDir(), "agents", "definitions.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeIdentifier(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
}

function assertValidAgentIdentifier(identifier: string): void {
  if (!identifier) {
    throw new Error("Agent identifier cannot be empty.");
  }

  if (!/^[a-z][a-z0-9._-]*$/i.test(identifier)) {
    throw new Error(
      `Invalid agent identifier "${identifier}". Use letters, numbers, ".", "_" or "-".`,
    );
  }
}

function normalizeRequiredString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeStringArray(value: unknown): string[] {
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

function normalizeScope(value: unknown): AgentDefinitionScope {
  if (value === "global" || value === "project") {
    return value;
  }

  return "project";
}

function normalizeMemoryScope(value: unknown): AgentMemoryScope {
  if (
    value === "none" ||
    value === "session" ||
    value === "project" ||
    value === "global"
  ) {
    return value;
  }

  return "session";
}

function normalizePermissionMode(value: unknown): PermissionMode {
  if (value === "ask" || value === "allow" || value === "deny") {
    return value;
  }

  return "ask";
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

function normalizeAgentDefinition(value: unknown): AgentDefinition | null {
  if (!isRecord(value)) {
    return null;
  }

  const identifier = normalizeIdentifier(value.identifier);

  if (!identifier) {
    return null;
  }

  const now = new Date().toISOString();
  const createdAt = normalizeIsoDate(value.createdAt, now);
  const updatedAt = normalizeIsoDate(value.updatedAt, createdAt);

  return {
    identifier,
    name: normalizeRequiredString(value.name, identifier),
    whenToUse: normalizeRequiredString(value.whenToUse, ""),
    systemPrompt: normalizeRequiredString(value.systemPrompt, ""),
    allowedTools: normalizeStringArray(value.allowedTools),
    model: normalizeNullableString(value.model),
    scope: normalizeScope(value.scope),
    memoryScope: normalizeMemoryScope(value.memoryScope),
    permissionMode: normalizePermissionMode(value.permissionMode),
    createdAt,
    updatedAt,
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
  };
}

function normalizeAgentDefinitionsFile(value: unknown): AgentDefinitionsFile {
  if (!isRecord(value) || !Array.isArray(value.agents)) {
    return {
      agents: [],
    };
  }

  return {
    agents: value.agents
      .map(normalizeAgentDefinition)
      .filter((agent): agent is AgentDefinition => agent !== null)
      .sort((left, right) => left.identifier.localeCompare(right.identifier)),
  };
}

export async function listAgentDefinitions(): Promise<AgentDefinition[]> {
  try {
    const raw = await readFile(getAgentDefinitionsFilePath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;

    return normalizeAgentDefinitionsFile(parsed).agents;
  } catch {
    return [];
  }
}

export async function saveAgentDefinitions(
  agents: AgentDefinition[],
): Promise<void> {
  const filePath = getAgentDefinitionsFilePath();

  await mkdir(dirname(filePath), { recursive: true });

  const normalizedAgents = agents
    .map(normalizeAgentDefinition)
    .filter((agent): agent is AgentDefinition => agent !== null)
    .sort((left, right) => left.identifier.localeCompare(right.identifier));

  await writeFile(
    filePath,
    JSON.stringify(
      {
        agents: normalizedAgents,
      },
      null,
      2,
    ),
    "utf8",
  );
}

export async function upsertAgentDefinition(
  input: AgentDefinitionInput,
): Promise<AgentDefinition> {
  const identifier = normalizeIdentifier(input.identifier);

  assertValidAgentIdentifier(identifier);

  const currentAgents = await listAgentDefinitions();
  const existingAgent = currentAgents.find(
    (agent) => agent.identifier === identifier,
  );

  const now = new Date().toISOString();

  const nextAgent = normalizeAgentDefinition({
    ...existingAgent,
    ...input,
    identifier,
    createdAt: existingAgent?.createdAt ?? input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  });

  if (!nextAgent) {
    throw new Error("Cannot persist agent definition without identifier.");
  }

  if (!nextAgent.whenToUse) {
    throw new Error(`Agent "${identifier}" requires whenToUse.`);
  }

  if (!nextAgent.systemPrompt) {
    throw new Error(`Agent "${identifier}" requires systemPrompt.`);
  }

  await saveAgentDefinitions([
    nextAgent,
    ...currentAgents.filter((agent) => agent.identifier !== identifier),
  ]);

  return nextAgent;
}

export async function readAgentDefinition(
  identifier: string,
): Promise<AgentDefinition | null> {
  const normalizedIdentifier = normalizeIdentifier(identifier);

  if (!normalizedIdentifier) {
    return null;
  }

  const agents = await listAgentDefinitions();

  return (
    agents.find((agent) => agent.identifier === normalizedIdentifier) ?? null
  );
}

export async function deleteAgentDefinition(
  identifier: string,
): Promise<boolean> {
  const normalizedIdentifier = normalizeIdentifier(identifier);

  if (!normalizedIdentifier) {
    return false;
  }

  const agents = await listAgentDefinitions();
  const nextAgents = agents.filter(
    (agent) => agent.identifier !== normalizedIdentifier,
  );

  if (nextAgents.length === agents.length) {
    return false;
  }

  await saveAgentDefinitions(nextAgents);

  return true;
}