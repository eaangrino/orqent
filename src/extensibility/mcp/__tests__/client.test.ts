import { describe, expect, it, vi } from "vitest";
import {
  connectMcpServer,
  createMcpTransport,
  type McpClientLike,
  type McpSdkAdapter,
  type McpServerConfig,
  type McpTransportLike,
} from "../index.js";

function createServer(
  overrides: Partial<McpServerConfig> = {},
): McpServerConfig {
  return {
    name: "postgres_local",
    enabled: true,
    transport: "streamable_http",
    command: null,
    args: [],
    env: {},
    url: "http://127.0.0.1:6060/mcp",
    headers: {
      Accept: "application/json, text/event-stream",
    },
    timeoutMs: 30_000,
    scope: "project",
    createdAt: "2026-04-29T00:00:00.000Z",
    updatedAt: "2026-04-29T00:00:00.000Z",
    ...overrides,
  };
}

function createFakeSdk() {
  const client: McpClientLike = {
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const stdioTransport: McpTransportLike = {
    close: vi.fn().mockResolvedValue(undefined),
  };

  const sseTransport: McpTransportLike = {
    close: vi.fn().mockResolvedValue(undefined),
  };

  const streamableHttpTransport: McpTransportLike = {
    close: vi.fn().mockResolvedValue(undefined),
  };

  const sdk: McpSdkAdapter = {
    createClient: vi.fn(() => client),
    createStdioTransport: vi.fn(() => stdioTransport),
    createSseTransport: vi.fn(() => sseTransport),
    createStreamableHttpTransport: vi.fn(() => streamableHttpTransport),
  };

  return {
    sdk,
    client,
    stdioTransport,
    sseTransport,
    streamableHttpTransport,
  };
}

describe("mcp client", () => {
  it("crea transporte stdio desde configuración MCP", () => {
    const { sdk, stdioTransport } = createFakeSdk();

    const server = createServer({
      name: "stdio_test",
      transport: "stdio",
      command: "node",
      args: [ "server.js" ],
      env: {
        DEBUG: "true",
      },
      url: null,
      headers: {},
    });

    const transport = createMcpTransport({
      server,
      sdk,
    });

    expect(transport).toBe(stdioTransport);
    expect(sdk.createStdioTransport).toHaveBeenCalledWith(server);
  });

  it("crea transporte sse desde configuración MCP", () => {
    const { sdk, sseTransport } = createFakeSdk();

    const server = createServer({
      name: "sse_test",
      transport: "sse",
      url: "https://example.com/sse",
      headers: {
        "X-API-Key": "test",
      },
    });

    const transport = createMcpTransport({
      server,
      sdk,
    });

    expect(transport).toBe(sseTransport);
    expect(sdk.createSseTransport).toHaveBeenCalledWith(server);
  });

  it("crea transporte streamable_http desde configuración MCP", () => {
    const { sdk, streamableHttpTransport } = createFakeSdk();

    const server = createServer({
      name: "http_test",
      transport: "streamable_http",
      url: "https://example.com/mcp",
      headers: {
        Authorization: "Bearer test",
      },
    });

    const transport = createMcpTransport({
      server,
      sdk,
    });

    expect(transport).toBe(streamableHttpTransport);
    expect(sdk.createStreamableHttpTransport).toHaveBeenCalledWith(server);
  });

  it("connectMcpServer conecta cliente y transporte", async () => {
    const {
      sdk,
      client,
      streamableHttpTransport,
    } = createFakeSdk();

    const server = createServer();

    const connected = await connectMcpServer({
      server,
      sdk,
    });

    expect(sdk.createClient).toHaveBeenCalledTimes(1);
    expect(sdk.createStreamableHttpTransport).toHaveBeenCalledWith(server);
    expect(client.connect).toHaveBeenCalledWith(streamableHttpTransport);

    await connected.close();

    expect(client.close).toHaveBeenCalledTimes(1);
    expect(streamableHttpTransport.close).toHaveBeenCalledTimes(1);
  });

  it("rechaza servidores disabled", async () => {
    const { sdk } = createFakeSdk();

    await expect(
      connectMcpServer({
        server: createServer({
          enabled: false,
        }),
        sdk,
      }),
    ).rejects.toThrow('MCP server "postgres_local" is disabled.');
  });

  it("rechaza stdio sin command", async () => {
    const { sdk } = createFakeSdk();

    await expect(
      connectMcpServer({
        server: createServer({
          name: "bad_stdio",
          transport: "stdio",
          command: null,
          url: null,
        }),
        sdk,
      }),
    ).rejects.toThrow('MCP server "bad_stdio" requires command.');
  });

  it("rechaza remoto sin url", async () => {
    const { sdk } = createFakeSdk();

    await expect(
      connectMcpServer({
        server: createServer({
          name: "bad_http",
          transport: "streamable_http",
          url: null,
        }),
        sdk,
      }),
    ).rejects.toThrow('MCP server "bad_http" requires url.');
  });

  it("falla por timeout si connect no resuelve", async () => {
    vi.useFakeTimers();

    const neverResolvingClient: McpClientLike = {
      connect: vi.fn(
        () =>
          new Promise<void>(() => {
            // intentionally unresolved
          }),
      ),
    };

    const sdk: McpSdkAdapter = {
      createClient: vi.fn(() => neverResolvingClient),
      createStdioTransport: vi.fn(() => ({})),
      createSseTransport: vi.fn(() => ({})),
      createStreamableHttpTransport: vi.fn(() => ({})),
    };

    const assertion = expect(
      connectMcpServer({
        server: createServer({
          timeoutMs: 1_000,
        }),
        sdk,
      }),
    ).rejects.toThrow(
      'MCP server "postgres_local" connection timed out after 1000ms.',
    );

    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;

    vi.useRealTimers();
  });
});