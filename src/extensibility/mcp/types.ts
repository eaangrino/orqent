export type McpServerTransport = "stdio" | "sse" | "streamable_http";

export type McpServerScope = "global" | "project";

export type McpServerConfigInput = {
  name: string;
  enabled?: boolean;
  transport: McpServerTransport;
  command?: string | null;
  args?: string[];
  env?: Record<string, string>;
  url?: string | null;
  headers?: Record<string, string>;
  timeoutMs?: number;
  scope?: McpServerScope;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
};

export type McpServerConfig = {
  name: string;
  enabled: boolean;
  transport: McpServerTransport;
  command: string | null;
  args: string[];
  env: Record<string, string>;
  url: string | null;
  headers: Record<string, string>;
  timeoutMs: number;
  scope: McpServerScope;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
};

export type McpServersFile = {
  servers: McpServerConfig[];
};