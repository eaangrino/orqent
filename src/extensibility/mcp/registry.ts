import type { McpServerConfig } from "./types.js";
import { listMcpServers } from "./storage.js";

function normalizeMcpServerName(name: string): string {
  return name.trim().toLowerCase();
}

function assertValidMcpServerName(name: string): void {
  if (!name.trim()) {
    throw new Error("MCP server name cannot be empty.");
  }

  if (!/^[a-z][a-z0-9._-]*$/i.test(name)) {
    throw new Error(
      `Invalid MCP server name "${name}". Use letters, numbers, ".", "_" or "-".`,
    );
  }
}

export class McpServerRegistry {
  private readonly servers = new Map<string, McpServerConfig>();

  constructor(servers: McpServerConfig[] = []) {
    for (const server of servers) {
      this.register(server);
    }
  }

  register(server: McpServerConfig): void {
    assertValidMcpServerName(server.name);

    const normalizedName = normalizeMcpServerName(server.name);

    if (this.servers.has(normalizedName)) {
      throw new Error(`MCP server "${server.name}" is already registered.`);
    }

    this.servers.set(normalizedName, {
      ...server,
      name: normalizedName,
      args: [ ...server.args ],
      env: { ...server.env },
      headers: { ...server.headers },
    });
  }

  list(): McpServerConfig[] {
    return Array.from(this.servers.values()).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  listEnabled(): McpServerConfig[] {
    return this.list().filter((server) => server.enabled);
  }

  get(name: string): McpServerConfig | undefined {
    return this.servers.get(normalizeMcpServerName(name));
  }

  has(name: string): boolean {
    return this.servers.has(normalizeMcpServerName(name));
  }

  delete(name: string): boolean {
    return this.servers.delete(normalizeMcpServerName(name));
  }
}

export function createMcpServerRegistry(
  servers: McpServerConfig[] = [],
): McpServerRegistry {
  return new McpServerRegistry(servers);
}

export async function loadMcpServerRegistry(): Promise<McpServerRegistry> {
  const servers = await listMcpServers();

  return createMcpServerRegistry(servers);
}