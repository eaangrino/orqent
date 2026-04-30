import type { McpServerConfig } from "./types.js";
import { readMcpServer } from "./storage.js";

export type McpListToolsResponseLike = {
  tools?: unknown[];
  nextCursor?: string;
};

export type McpClientLike = {
  connect: (transport: unknown) => Promise<void>;
  close?: () => Promise<void>;
  listTools?: (params?: { cursor?: string }) => Promise<McpListToolsResponseLike>;
};

export type McpTransportLike = {
  close?: () => Promise<void>;
};

export type McpSdkAdapter = {
  createClient: () => McpClientLike;
  createStdioTransport: (server: McpServerConfig) => McpTransportLike;
  createSseTransport: (server: McpServerConfig) => McpTransportLike;
  createStreamableHttpTransport: (server: McpServerConfig) => McpTransportLike;
};

export type ConnectedMcpServer = {
  server: McpServerConfig;
  client: McpClientLike;
  transport: McpTransportLike;
  close: () => Promise<void>;
};

export type McpDiscoveredTool = {
  name: string;
  description: string | null;
  inputSchema: unknown | null;
  raw: unknown;
};

export type ListConfiguredMcpServerToolsInput = {
  name: string;
  sdk?: McpSdkAdapter;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeMcpTool(value: unknown): McpDiscoveredTool | null {
  if (!isRecord(value) || typeof value.name !== "string" || !value.name.trim()) {
    return null;
  }

  return {
    name: value.name.trim(),
    description:
      typeof value.description === "string" && value.description.trim()
        ? value.description.trim()
        : null,
    inputSchema: value.inputSchema ?? null,
    raw: value,
  };
}

export type ConnectConfiguredMcpServerInput = {
  name: string;
  sdk?: McpSdkAdapter;
};

export async function connectConfiguredMcpServer({
  name,
  sdk,
}: ConnectConfiguredMcpServerInput): Promise<ConnectedMcpServer> {
  const server = await readMcpServer(name);

  if (!server) {
    throw new Error(`MCP server "${name}" was not found.`);
  }

  return connectMcpServer({
    server,
    sdk,
  });
}

function assertConnectableServer(server: McpServerConfig): void {
  if (!server.enabled) {
    throw new Error(`MCP server "${server.name}" is disabled.`);
  }

  if (server.transport === "stdio" && !server.command) {
    throw new Error(`MCP server "${server.name}" requires command.`);
  }

  if (
    (server.transport === "sse" || server.transport === "streamable_http") &&
    !server.url
  ) {
    throw new Error(`MCP server "${server.name}" requires url.`);
  }
}

function createHeaders(server: McpServerConfig): HeadersInit | undefined {
  return Object.keys(server.headers).length > 0 ? server.headers : undefined;
}

async function withTimeout<TValue>({
  promise,
  timeoutMs,
  label,
}: {
  promise: Promise<TValue>;
  timeoutMs: number;
  label: string;
}): Promise<TValue> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([ promise, timeoutPromise ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function createDefaultMcpSdkAdapter(): Promise<McpSdkAdapter> {
  const [
    clientModule,
    stdioModule,
    sseModule,
    streamableHttpModule,
  ] = await Promise.all([
    import("@modelcontextprotocol/sdk/client/index.js"),
    import("@modelcontextprotocol/sdk/client/stdio.js"),
    import("@modelcontextprotocol/sdk/client/sse.js"),
    import("@modelcontextprotocol/sdk/client/streamableHttp.js"),
  ]);

  return {
    createClient() {
      const client = new clientModule.Client({
        name: "orqent",
        version: "1.0.0",
      });

      return {
        connect(transport: unknown) {
          return client.connect(
            transport as Parameters<typeof client.connect>[ 0 ],
          );
        },
        close() {
          return client.close();
        },
        listTools(params?: { cursor?: string }) {
          return client.listTools(
            params as Parameters<typeof client.listTools>[ 0 ],
          ) as Promise<McpListToolsResponseLike>;
        },
      };
    },

    createStdioTransport(server) {
      return new stdioModule.StdioClientTransport({
        command: server.command ?? "",
        args: server.args,
        env: server.env,
      });
    },

    createSseTransport(server) {
      return new sseModule.SSEClientTransport(new URL(server.url ?? ""), {
        requestInit: {
          headers: createHeaders(server),
        },
      });
    },

    createStreamableHttpTransport(server) {
      return new streamableHttpModule.StreamableHTTPClientTransport(
        new URL(server.url ?? ""),
        {
          requestInit: {
            headers: createHeaders(server),
          },
        },
      );
    },
  };
}

export function createMcpTransport({
  server,
  sdk,
}: {
  server: McpServerConfig;
  sdk: McpSdkAdapter;
}): McpTransportLike {
  switch (server.transport) {
    case "stdio":
      return sdk.createStdioTransport(server);

    case "sse":
      return sdk.createSseTransport(server);

    case "streamable_http":
      return sdk.createStreamableHttpTransport(server);
  }
}

export async function connectMcpServer({
  server,
  sdk,
}: {
  server: McpServerConfig;
  sdk?: McpSdkAdapter;
}): Promise<ConnectedMcpServer> {
  assertConnectableServer(server);

  const resolvedSdk = sdk ?? await createDefaultMcpSdkAdapter();
  const client = resolvedSdk.createClient();
  const transport = createMcpTransport({
    server,
    sdk: resolvedSdk,
  });

  await withTimeout({
    promise: client.connect(transport),
    timeoutMs: server.timeoutMs,
    label: `MCP server "${server.name}" connection`,
  });

  return {
    server,
    client,
    transport,
    async close() {
      await client.close?.();
      await transport.close?.();
    },
  };
}

export async function listConfiguredMcpServerTools({
  name,
  sdk,
}: ListConfiguredMcpServerToolsInput): Promise<McpDiscoveredTool[]> {
  const connected = await connectConfiguredMcpServer({
    name,
    sdk,
  });

  try {
    if (!connected.client.listTools) {
      throw new Error("MCP client adapter does not support listTools.");
    }

    const tools: McpDiscoveredTool[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;

    for (let page = 0; page < 50; page++) {
      const response = await withTimeout({
        promise: connected.client.listTools({ cursor }),
        timeoutMs: connected.server.timeoutMs,
        label: `MCP server "${connected.server.name}" tool discovery`,
      });

      tools.push(
        ...(response.tools ?? [])
          .map(normalizeMcpTool)
          .filter((tool): tool is McpDiscoveredTool => tool !== null),
      );

      const nextCursor =
        typeof response.nextCursor === "string" && response.nextCursor.trim()
          ? response.nextCursor.trim()
          : undefined;

      if (!nextCursor) {
        break;
      }

      if (seenCursors.has(nextCursor)) {
        throw new Error(
          `MCP server "${connected.server.name}" returned a repeated tools cursor.`,
        );
      }

      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }

    return tools.sort((left, right) => left.name.localeCompare(right.name));
  } finally {
    await connected.close();
  }
}