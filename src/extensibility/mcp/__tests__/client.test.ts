import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  connectMcpServer,
  createMcpTransport,
  connectConfiguredMcpServer,
  upsertMcpServer,
  listConfiguredMcpServerTools,
  listConfiguredMcpServerResources,
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
    listTools: vi.fn().mockResolvedValue({
      tools: [],
    }),
    listResources: vi.fn().mockResolvedValue({
      resources: [],
    }),
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

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, {
      recursive: true,
      force: true,
    });
    tempDir = "";
  }

  delete process.env.ORQENT_DATA_DIR;
});

describe("mcp client", () => {
  it("listConfiguredMcpServerTools descubre tools de un servidor persistido", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-mcp-client-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await upsertMcpServer({
      name: "postgres_local",
      transport: "streamable_http",
      url: "http://127.0.0.1:6060/mcp",
      headers: {
        Accept: "application/json, text/event-stream",
      },
      timeoutMs: 30_000,
    });

    const { sdk, client } = createFakeSdk();

    vi.mocked(client.listTools!).mockResolvedValue({
      tools: [
        {
          name: "query",
          description: "Run a read-only query.",
          inputSchema: {
            type: "object",
          },
        },
        {
          name: "schema",
        },
      ],
    });

    const tools = await listConfiguredMcpServerTools({
      name: "postgres_local",
      sdk,
    });

    expect(tools).toEqual([
      {
        name: "query",
        description: "Run a read-only query.",
        inputSchema: {
          type: "object",
        },
        raw: {
          name: "query",
          description: "Run a read-only query.",
          inputSchema: {
            type: "object",
          },
        },
      },
      {
        name: "schema",
        description: null,
        inputSchema: null,
        raw: {
          name: "schema",
        },
      },
    ]);

    expect(client.listTools).toHaveBeenCalledWith({
      cursor: undefined,
    });
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it("listConfiguredMcpServerResources descubre resources de un servidor persistido", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-mcp-client-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await upsertMcpServer({
      name: "postgres_local",
      transport: "streamable_http",
      url: "http://127.0.0.1:6060/mcp",
      headers: {
        Accept: "application/json, text/event-stream",
      },
      timeoutMs: 30_000,
    });

    const { sdk, client } = createFakeSdk();

    vi.mocked(client.listResources!).mockResolvedValue({
      resources: [
        {
          name: "database schema",
          uri: "postgres://schema/public",
          description: "Public schema metadata.",
          mimeType: "application/json",
        },
        {
          uri: "postgres://stats/top-queries",
        },
      ],
    });

    const resources = await listConfiguredMcpServerResources({
      name: "postgres_local",
      sdk,
    });

    expect(resources).toEqual([
      {
        name: "database schema",
        uri: "postgres://schema/public",
        description: "Public schema metadata.",
        mimeType: "application/json",
        raw: {
          name: "database schema",
          uri: "postgres://schema/public",
          description: "Public schema metadata.",
          mimeType: "application/json",
        },
      },
      {
        name: null,
        uri: "postgres://stats/top-queries",
        description: null,
        mimeType: null,
        raw: {
          uri: "postgres://stats/top-queries",
        },
      },
    ]);

    expect(client.listResources).toHaveBeenCalledWith({
      cursor: undefined,
    });
    expect(client.close).toHaveBeenCalledTimes(1);
  });

  it("listConfiguredMcpServerResources soporta paginación", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-mcp-client-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await upsertMcpServer({
      name: "paged_resources",
      transport: "streamable_http",
      url: "http://127.0.0.1:6060/mcp",
    });

    const { sdk, client } = createFakeSdk();

    vi.mocked(client.listResources!)
      .mockResolvedValueOnce({
        resources: [
          {
            uri: "resource://b",
          },
        ],
        nextCursor: "page-2",
      })
      .mockResolvedValueOnce({
        resources: [
          {
            uri: "resource://a",
          },
        ],
      });

    const resources = await listConfiguredMcpServerResources({
      name: "paged_resources",
      sdk,
    });

    expect(resources.map((resource) => resource.uri)).toEqual([
      "resource://a",
      "resource://b",
    ]);

    expect(client.listResources).toHaveBeenNthCalledWith(1, {
      cursor: undefined,
    });
    expect(client.listResources).toHaveBeenNthCalledWith(2, {
      cursor: "page-2",
    });
  });

  it("listConfiguredMcpServerTools soporta paginación", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-mcp-client-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await upsertMcpServer({
      name: "paged",
      transport: "streamable_http",
      url: "http://127.0.0.1:6060/mcp",
    });

    const { sdk, client } = createFakeSdk();

    vi.mocked(client.listTools!)
      .mockResolvedValueOnce({
        tools: [
          {
            name: "b_tool",
          },
        ],
        nextCursor: "page-2",
      })
      .mockResolvedValueOnce({
        tools: [
          {
            name: "a_tool",
          },
        ],
      });

    const tools = await listConfiguredMcpServerTools({
      name: "paged",
      sdk,
    });

    expect(tools.map((tool) => tool.name)).toEqual([
      "a_tool",
      "b_tool",
    ]);

    expect(client.listTools).toHaveBeenNthCalledWith(1, {
      cursor: undefined,
    });
    expect(client.listTools).toHaveBeenNthCalledWith(2, {
      cursor: "page-2",
    });
  });

  it("connectConfiguredMcpServer conecta un servidor persistido por nombre", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-mcp-client-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await upsertMcpServer({
      name: "postgres_local",
      transport: "streamable_http",
      url: "http://127.0.0.1:6060/mcp",
      headers: {
        Accept: "application/json, text/event-stream",
      },
      timeoutMs: 30_000,
    });

    const {
      sdk,
      client,
      streamableHttpTransport,
    } = createFakeSdk();

    const connected = await connectConfiguredMcpServer({
      name: "postgres_local",
      sdk,
    });

    expect(connected.server.name).toBe("postgres_local");
    expect(sdk.createStreamableHttpTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "postgres_local",
        transport: "streamable_http",
        url: "http://127.0.0.1:6060/mcp",
      }),
    );
    expect(client.connect).toHaveBeenCalledWith(streamableHttpTransport);
  });

  it("connectConfiguredMcpServer falla si el servidor no existe", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-mcp-client-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const { sdk } = createFakeSdk();

    await expect(
      connectConfiguredMcpServer({
        name: "missing",
        sdk,
      }),
    ).rejects.toThrow('MCP server "missing" was not found.');
  });

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