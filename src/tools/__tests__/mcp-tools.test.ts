import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultPermissionPolicy } from "../../security/index.js";
import {
  createToolRegistry,
  executeTool,
  type ToolExecutionResult,
} from "../index.js";
import {
  mcpDeleteServerTool,
  mcpListServersTool,
  mcpUpsertServerTool,
} from "../builtin/mcp.js";

let tempDir = "";

function expectOkResult<TResult>(
  result: ToolExecutionResult,
): asserts result is {
  ok: true;
  result: TResult;
  metadata?: Record<string, unknown>;
} {
  expect(result.ok).toBe(true);
}

function createRegistry() {
  return createToolRegistry([
    mcpListServersTool,
    mcpUpsertServerTool,
    mcpDeleteServerTool,
  ]);
}

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

describe("mcp tools", () => {
  it("mcp.list_servers devuelve lista vacía inicialmente", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-mcp-tools-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const result = await executeTool({
      registry: createRegistry(),
      toolName: "mcp.list_servers",
      input: {},
      sessionId: "session-test",
      permissionPolicy: createDefaultPermissionPolicy("allow"),
    });

    expectOkResult<{
      servers: unknown[];
      count: number;
    }>(result);

    expect(result.result.servers).toEqual([]);
    expect(result.result.count).toBe(0);
  });

  it("mcp.upsert_server persiste servidor y mcp.list_servers lo lista de forma segura", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-mcp-tools-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createRegistry();

    const upsertResult = await executeTool({
      registry,
      toolName: "mcp.upsert_server",
      input: {
        name: "Filesystem",
        enabled: true,
        transport: "stdio",
        command: "npx",
        args: [ "-y", "@modelcontextprotocol/server-filesystem", "." ],
        env: {
          SECRET_TOKEN: "should-not-leak",
        },
      },
      sessionId: "session-test",
      permissionPolicy: createDefaultPermissionPolicy("allow"),
    });

    expectOkResult<{
      server: {
        name: string;
        hasCommand: boolean;
        hasArgs: boolean;
        hasEnv: boolean;
      };
      message: string;
    }>(upsertResult);

    expect(upsertResult.result.server).toMatchObject({
      name: "filesystem",
      hasCommand: true,
      hasArgs: true,
      hasEnv: true,
    });

    expect(JSON.stringify(upsertResult.result)).not.toContain("should-not-leak");
    expect(JSON.stringify(upsertResult.result)).not.toContain(
      "@modelcontextprotocol/server-filesystem",
    );

    const listResult = await executeTool({
      registry,
      toolName: "mcp.list_servers",
      input: {},
      sessionId: "session-test",
      permissionPolicy: createDefaultPermissionPolicy("allow"),
    });

    expectOkResult<{
      servers: Array<{
        name: string;
        transport: string;
        hasCommand: boolean;
        hasArgs: boolean;
        hasEnv: boolean;
      }>;
      count: number;
    }>(listResult);

    expect(listResult.result.count).toBe(1);
    expect(listResult.result.servers[ 0 ]).toMatchObject({
      name: "filesystem",
      transport: "stdio",
      hasCommand: true,
      hasArgs: true,
      hasEnv: true,
    });

    expect(JSON.stringify(listResult.result)).not.toContain("should-not-leak");
    expect(JSON.stringify(listResult.result)).not.toContain(
      "@modelcontextprotocol/server-filesystem",
    );
  });

  it("mcp.list_servers puede excluir servidores disabled", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-mcp-tools-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createRegistry();

    await executeTool({
      registry,
      toolName: "mcp.upsert_server",
      input: {
        name: "disabled-server",
        enabled: false,
        transport: "stdio",
        command: "node",
      },
      sessionId: "session-test",
      permissionPolicy: createDefaultPermissionPolicy("allow"),
    });

    const result = await executeTool({
      registry,
      toolName: "mcp.list_servers",
      input: {
        includeDisabled: false,
      },
      sessionId: "session-test",
      permissionPolicy: createDefaultPermissionPolicy("allow"),
    });

    expectOkResult<{
      servers: unknown[];
      count: number;
    }>(result);

    expect(result.result.servers).toEqual([]);
    expect(result.result.count).toBe(0);
  });

  it("mcp.delete_server elimina configuración existente", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-mcp-tools-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createRegistry();

    await executeTool({
      registry,
      toolName: "mcp.upsert_server",
      input: {
        name: "temporary",
        transport: "stdio",
        command: "node",
      },
      sessionId: "session-test",
      permissionPolicy: createDefaultPermissionPolicy("allow"),
    });

    const deleteResult = await executeTool({
      registry,
      toolName: "mcp.delete_server",
      input: {
        name: "temporary",
      },
      sessionId: "session-test",
      permissionPolicy: createDefaultPermissionPolicy("allow"),
    });

    expectOkResult<{
      deleted: boolean;
    }>(deleteResult);

    expect(deleteResult.result.deleted).toBe(true);

    const listResult = await executeTool({
      registry,
      toolName: "mcp.list_servers",
      input: {},
      sessionId: "session-test",
      permissionPolicy: createDefaultPermissionPolicy("allow"),
    });

    expectOkResult<{
      count: number;
    }>(listResult);

    expect(listResult.result.count).toBe(0);
  });

  it("mcp.upsert_server rechaza transporte inválido", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-mcp-tools-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const result = await executeTool({
      registry: createRegistry(),
      toolName: "mcp.upsert_server",
      input: {
        name: "bad",
        transport: "websocket",
      },
      sessionId: "session-test",
      permissionPolicy: createDefaultPermissionPolicy("allow"),
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe("invalid_tool_input");
      expect(result.error.message).toContain(
        "transport must be one of: stdio, sse, streamable_http.",
      );
    }
  });
});