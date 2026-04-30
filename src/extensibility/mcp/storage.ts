import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type {
  McpServerConfig,
  McpServerConfigInput,
  McpServerScope,
  McpServerTransport,
  McpServersFile,
} from "./types.js";

const DEFAULT_MCP_TIMEOUT_MS = 30_000;

function resolveDataDir() {
  const customDir = process.env.ORQENT_DATA_DIR?.trim();

  if (customDir) {
    return customDir;
  }

  return join(homedir(), ".orqent");
}

export function getMcpServersFilePath() {
  return join(resolveDataDir(), "mcp", "servers.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeName(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function assertValidMcpServerName(name: string): void {
  if (!name) {
    throw new Error("MCP server name cannot be empty.");
  }

  if (!/^[a-z][a-z0-9._-]*$/i.test(name)) {
    throw new Error(
      `Invalid MCP server name "${name}". Use letters, numbers, ".", "_" or "-".`,
    );
  }
}

function normalizeTransport(value: unknown): McpServerTransport | null {
  if (
    value === "stdio" ||
    value === "sse" ||
    value === "streamable_http"
  ) {
    return value;
  }

  return null;
}

function normalizeScope(value: unknown): McpServerScope {
  if (value === "global" || value === "project") {
    return value;
  }

  return "project";
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [ string, string ] => {
        const [ key, recordValue ] = entry;

        return Boolean(key.trim()) && typeof recordValue === "string";
      })
      .map(([ key, recordValue ]) => [ key.trim(), recordValue ]),
  );
}

function normalizeTimeoutMs(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_MCP_TIMEOUT_MS;
  }

  return Math.min(300_000, Math.max(1_000, Math.round(value)));
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

function normalizeMcpServerConfig(value: unknown): McpServerConfig | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = normalizeName(value.name);
  const transport = normalizeTransport(value.transport);

  if (!name || !transport) {
    return null;
  }

  const now = new Date().toISOString();
  const createdAt = normalizeIsoDate(value.createdAt, now);
  const updatedAt = normalizeIsoDate(value.updatedAt, createdAt);

  return {
    name,
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    transport,
    command: normalizeNullableString(value.command),
    args: normalizeStringArray(value.args),
    env: normalizeStringRecord(value.env),
    url: normalizeNullableString(value.url),
    headers: normalizeStringRecord(value.headers),
    timeoutMs: normalizeTimeoutMs(value.timeoutMs),
    scope: normalizeScope(value.scope),
    createdAt,
    updatedAt,
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
  };
}

function validateMcpServerConfig(config: McpServerConfig): void {
  assertValidMcpServerName(config.name);

  if (config.transport === "stdio" && !config.command) {
    throw new Error(`MCP server "${config.name}" with stdio transport requires command.`);
  }

  if (
    (config.transport === "sse" || config.transport === "streamable_http") &&
    !config.url
  ) {
    throw new Error(
      `MCP server "${config.name}" with ${config.transport} transport requires url.`,
    );
  }
}

function normalizeMcpServersFile(value: unknown): McpServersFile {
  if (!isRecord(value) || !Array.isArray(value.servers)) {
    return {
      servers: [],
    };
  }

  return {
    servers: value.servers
      .map(normalizeMcpServerConfig)
      .filter((server): server is McpServerConfig => server !== null)
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}

export async function listMcpServers(): Promise<McpServerConfig[]> {
  try {
    const raw = await readFile(getMcpServersFilePath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;

    return normalizeMcpServersFile(parsed).servers;
  } catch {
    return [];
  }
}

export async function saveMcpServers(
  servers: McpServerConfig[],
): Promise<void> {
  const filePath = getMcpServersFilePath();

  await mkdir(dirname(filePath), {
    recursive: true,
  });

  const normalizedServers = servers
    .map(normalizeMcpServerConfig)
    .filter((server): server is McpServerConfig => server !== null)
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const server of normalizedServers) {
    validateMcpServerConfig(server);
  }

  await writeFile(
    filePath,
    JSON.stringify(
      {
        servers: normalizedServers,
      },
      null,
      2,
    ),
    "utf8",
  );
}

export async function upsertMcpServer(
  input: McpServerConfigInput,
): Promise<McpServerConfig> {
  const name = normalizeName(input.name);

  assertValidMcpServerName(name);

  const currentServers = await listMcpServers();
  const existingServer = currentServers.find((server) => server.name === name);
  const now = new Date().toISOString();

  const nextServer = normalizeMcpServerConfig({
    ...existingServer,
    ...input,
    name,
    createdAt: existingServer?.createdAt ?? input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  });

  if (!nextServer) {
    throw new Error("Cannot persist invalid MCP server config.");
  }

  validateMcpServerConfig(nextServer);

  await saveMcpServers([
    nextServer,
    ...currentServers.filter((server) => server.name !== name),
  ]);

  return nextServer;
}

export async function readMcpServer(
  name: string,
): Promise<McpServerConfig | null> {
  const normalizedName = normalizeName(name);

  if (!normalizedName) {
    return null;
  }

  const servers = await listMcpServers();

  return servers.find((server) => server.name === normalizedName) ?? null;
}

export async function deleteMcpServer(name: string): Promise<boolean> {
  const normalizedName = normalizeName(name);

  if (!normalizedName) {
    return false;
  }

  const servers = await listMcpServers();
  const nextServers = servers.filter((server) => server.name !== normalizedName);

  if (nextServers.length === servers.length) {
    return false;
  }

  await saveMcpServers(nextServers);

  return true;
}