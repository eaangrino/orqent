import {
  deleteMcpServer,
  listMcpServers,
  upsertMcpServer,
  callConfiguredMcpServerTool,
  type McpServerConfig,
  type McpServerConfigInput,
  type McpServerTransport,
} from "../../extensibility/mcp/index.js";
import type {
  ToolDefinition,
  ToolExecutionResult,
  ToolValidationResult,
} from "../types.js";

type McpListServersInput = {
  includeDisabled: boolean;
};

type McpListServersResult = {
  servers: McpServerSafeView[];
  count: number;
};

type McpUpsertServerInput = McpServerConfigInput;

type McpUpsertServerResult = {
  server: McpServerSafeView;
  message: string;
};

type McpDeleteServerInput = {
  name: string;
};

type McpDeleteServerResult = {
  name: string;
  deleted: boolean;
  message: string;
};

type McpServerSafeView = {
  name: string;
  enabled: boolean;
  transport: McpServerTransport;
  scope: string;
  hasCommand: boolean;
  hasArgs: boolean;
  hasEnv: boolean;
  hasUrl: boolean;
  hasHeaders: boolean;
  timeoutMs: number;
  createdAt: string;
  updatedAt: string;
};

export type McpCallToolInput = {
  serverName: string;
  toolName: string;
  arguments: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeName(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
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

function normalizeTimeoutMs(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.min(300_000, Math.max(1_000, Math.round(value)));
}

function toSafeView(server: McpServerConfig): McpServerSafeView {
  return {
    name: server.name,
    enabled: server.enabled,
    transport: server.transport,
    scope: server.scope,
    hasCommand: Boolean(server.command),
    hasArgs: server.args.length > 0,
    hasEnv: Object.keys(server.env).length > 0,
    hasUrl: Boolean(server.url),
    hasHeaders: Object.keys(server.headers).length > 0,
    timeoutMs: server.timeoutMs,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
  };
}

function validateListServersInput(
  input: unknown,
): ToolValidationResult<McpListServersInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Input must be an object.",
    };
  }

  return {
    ok: true,
    input: {
      includeDisabled: normalizeBoolean(input.includeDisabled, true),
    },
  };
}

function validateUpsertServerInput(
  input: unknown,
): ToolValidationResult<McpUpsertServerInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Input must be an object.",
    };
  }

  const name = normalizeName(input.name);

  if (!name) {
    return {
      ok: false,
      error: "name must be a non-empty string.",
    };
  }

  const transport = normalizeTransport(input.transport);

  if (!transport) {
    return {
      ok: false,
      error: "transport must be one of: stdio, sse, streamable_http.",
    };
  }

  const command = normalizeNullableString(input.command);
  const url = normalizeNullableString(input.url);

  if (transport === "stdio" && !command) {
    return {
      ok: false,
      error: "stdio transport requires command.",
    };
  }

  if ((transport === "sse" || transport === "streamable_http") && !url) {
    return {
      ok: false,
      error: `${transport} transport requires url.`,
    };
  }

  return {
    ok: true,
    input: {
      name,
      enabled: normalizeBoolean(input.enabled, true),
      transport,
      command,
      args: normalizeStringArray(input.args),
      env: normalizeStringRecord(input.env),
      url,
      headers: normalizeStringRecord(input.headers),
      timeoutMs: normalizeTimeoutMs(input.timeoutMs),
      scope: input.scope === "global" ? "global" : "project",
      metadata: isRecord(input.metadata) ? input.metadata : undefined,
    },
  };
}

function validateDeleteServerInput(
  input: unknown,
): ToolValidationResult<McpDeleteServerInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Input must be an object.",
    };
  }

  const name = normalizeName(input.name);

  if (!name) {
    return {
      ok: false,
      error: "name must be a non-empty string.",
    };
  }

  return {
    ok: true,
    input: {
      name,
    },
  };
}

function normalizeMcpCallToolInput(input: unknown):
  | {
    ok: true;
    input: McpCallToolInput;
  }
  | {
    ok: false;
    error: string;
  } {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "input must be an object.",
    };
  }

  const serverName =
    typeof input.serverName === "string" ? input.serverName.trim() : "";
  const toolName =
    typeof input.toolName === "string" ? input.toolName.trim() : "";

  if (!serverName) {
    return {
      ok: false,
      error: "serverName must be a non-empty string.",
    };
  }

  if (!toolName) {
    return {
      ok: false,
      error: "toolName must be a non-empty string.",
    };
  }

  if (
    input.arguments !== undefined &&
    (!isRecord(input.arguments) || Array.isArray(input.arguments))
  ) {
    return {
      ok: false,
      error: "arguments must be an object when provided.",
    };
  }

  return {
    ok: true,
    input: {
      serverName,
      toolName,
      arguments: isRecord(input.arguments) ? input.arguments : {},
    },
  };
}

// Export tools

export const mcpListServersTool: ToolDefinition<
  McpListServersInput,
  McpListServersResult
> = {
  name: "mcp.list_servers",
  description:
    "List persisted MCP server configurations known by Orqent. Does not connect to MCP servers.",
  inputSchema: {
    type: "object",
    properties: {
      includeDisabled: {
        type: "boolean",
        description: "Whether disabled MCP servers should be included.",
      },
    },
    required: [],
    additionalProperties: false,
  },
  risk: "safe",
  permissions: [ "mcp:read" ],
  requiresConfirmation: false,
  isReadOnly: true,
  validateInput: validateListServersInput,
  async execute(input): Promise<ToolExecutionResult<McpListServersResult>> {
    const servers = await listMcpServers();
    const visibleServers = input.includeDisabled
      ? servers
      : servers.filter((server) => server.enabled);

    return {
      ok: true,
      result: {
        servers: visibleServers.map(toSafeView),
        count: visibleServers.length,
      },
    };
  },
};

export const mcpUpsertServerTool: ToolDefinition<
  McpUpsertServerInput,
  McpUpsertServerResult
> = {
  name: "mcp.upsert_server",
  description:
    "Create or update a persisted MCP server configuration. Does not connect to or execute the server.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Stable MCP server name.",
      },
      enabled: {
        type: "boolean",
        description: "Whether this server is enabled.",
      },
      transport: {
        type: "string",
        enum: [ "stdio", "sse", "streamable_http" ],
        description: "MCP transport type.",
      },
      command: {
        type: "string",
        description: "Command for stdio MCP servers.",
      },
      args: {
        type: "array",
        items: {
          type: "string",
        },
        description: "Command arguments for stdio MCP servers.",
      },
      env: {
        type: "object",
        additionalProperties: {
          type: "string",
        },
        description: "Environment variables for the MCP server.",
      },
      url: {
        type: "string",
        description: "Remote MCP endpoint URL for sse or streamable_http.",
      },
      headers: {
        type: "object",
        additionalProperties: {
          type: "string",
        },
        description: "Headers for remote MCP servers.",
      },
      timeoutMs: {
        type: "number",
        description: "Connection or execution timeout in milliseconds.",
      },
      scope: {
        type: "string",
        enum: [ "global", "project" ],
        description: "Configuration scope.",
      },
      metadata: {
        type: "object",
        description: "Optional metadata.",
      },
    },
    required: [ "name", "transport" ],
    additionalProperties: false,
  },
  risk: "medium",
  permissions: [ "mcp:write" ],
  requiresConfirmation: true,
  isReadOnly: false,
  validateInput: validateUpsertServerInput,
  async execute(input): Promise<ToolExecutionResult<McpUpsertServerResult>> {
    const server = await upsertMcpServer(input);

    return {
      ok: true,
      result: {
        server: toSafeView(server),
        message:
          "MCP server configuration persisted. Real MCP connection and tool discovery are not wired yet.",
      },
    };
  },
};

export const mcpDeleteServerTool: ToolDefinition<
  McpDeleteServerInput,
  McpDeleteServerResult
> = {
  name: "mcp.delete_server",
  description:
    "Delete a persisted MCP server configuration. Does not affect running external processes.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "MCP server name to delete.",
      },
    },
    required: [ "name" ],
    additionalProperties: false,
  },
  risk: "medium",
  permissions: [ "mcp:write" ],
  requiresConfirmation: true,
  isReadOnly: false,
  validateInput: validateDeleteServerInput,
  async execute(input): Promise<ToolExecutionResult<McpDeleteServerResult>> {
    const deleted = await deleteMcpServer(input.name);

    return {
      ok: true,
      result: {
        name: input.name,
        deleted,
        message: deleted
          ? "MCP server configuration deleted."
          : "MCP server configuration was not found.",
      },
    };
  },
};

export const mcpCallToolTool: ToolDefinition<McpCallToolInput> = {
  name: "mcp.call_tool",
  description:
    "Execute a real tool exposed by a configured MCP server. Use only when the user explicitly asks to use an MCP server/tool or when MCP execution is required.",
  inputSchema: {
    type: "object",
    properties: {
      serverName: {
        type: "string",
        description: "Configured MCP server name, for example everything or postgres_local.",
      },
      toolName: {
        type: "string",
        description: "Tool name exposed by the MCP server, for example echo or execute_sql.",
      },
      arguments: {
        type: "object",
        description: "Arguments object passed to the MCP tool.",
      },
    },
    required: [ "serverName", "toolName" ],
    additionalProperties: false,
  },
  risk: "high",
  permissions: [ "mcp:write" ],
  requiresConfirmation: true,
  isReadOnly: false,
  validateInput: normalizeMcpCallToolInput,
  async execute(input) {
    try {
      const result = await callConfiguredMcpServerTool(input);

      return {
        ok: true,
        result,
      };
    } catch (error_) {
      return {
        ok: false,
        error: {
          code: "mcp_tool_execution_failed",
          message:
            error_ instanceof Error
              ? error_.message
              : "Unknown MCP tool execution error.",
        },
      };
    }
  },
};