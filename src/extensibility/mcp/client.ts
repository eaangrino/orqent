import type { McpServerConfig } from "./types.js";
import { readMcpServer } from "./storage.js";

export type McpClientLike = {
  connect: (transport: unknown) => Promise<void>;
  close?: () => Promise<void>;
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