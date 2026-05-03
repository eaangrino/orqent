import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  deleteMcpServer,
  getMcpServersFilePath,
  listMcpServers,
  readMcpServer,
  upsertMcpServer,
} from "../index.js";

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

describe("mcp server storage", () => {
  it("listMcpServers devuelve lista vacía cuando no existe archivo", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-mcp-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await expect(listMcpServers()).resolves.toEqual([]);
  });

  it("upsertMcpServer crea configuración stdio persistente", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-mcp-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const server = await upsertMcpServer({
      name: "Filesystem",
      enabled: true,
      transport: "stdio",
      command: "npx",
      args: [ "-y", "@modelcontextprotocol/server-filesystem", "." ],
      env: {
        NODE_ENV: "test",
      },
      timeoutMs: 10_000,
      scope: "project",
      createdAt: "2026-04-29T00:00:00.000Z",
      updatedAt: "2026-04-29T00:01:00.000Z",
    });

    expect(server).toEqual({
      name: "filesystem",
      enabled: true,
      transport: "stdio",
      command: "npx",
      args: [ "-y", "@modelcontextprotocol/server-filesystem", "." ],
      env: {
        NODE_ENV: "test",
      },
      url: null,
      headers: {},
      timeoutMs: 10_000,
      scope: "project",
      createdAt: "2026-04-29T00:00:00.000Z",
      updatedAt: "2026-04-29T00:01:00.000Z",
    });

    const raw = await readFile(getMcpServersFilePath(), "utf8");
    const parsed = JSON.parse(raw);

    expect(parsed.servers).toHaveLength(1);
    expect(parsed.servers[ 0 ]).toEqual(server);
  });

  it("upsertMcpServer actualiza configuración existente sin duplicarla", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-mcp-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await upsertMcpServer({
      name: "browser",
      transport: "sse",
      url: "http://localhost:3000/sse",
      enabled: true,
      createdAt: "2026-04-29T00:00:00.000Z",
      updatedAt: "2026-04-29T00:01:00.000Z",
    });

    await upsertMcpServer({
      name: "browser",
      transport: "sse",
      url: "http://localhost:4000/sse",
      enabled: false,
      updatedAt: "2026-04-29T00:02:00.000Z",
    });

    const servers = await listMcpServers();

    expect(servers).toHaveLength(1);
    expect(servers[ 0 ]).toMatchObject({
      name: "browser",
      enabled: false,
      transport: "sse",
      url: "http://localhost:4000/sse",
      createdAt: "2026-04-29T00:00:00.000Z",
      updatedAt: "2026-04-29T00:02:00.000Z",
    });
  });

  it("readMcpServer lee por nombre normalizado", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-mcp-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await upsertMcpServer({
      name: "GitHub",
      transport: "streamable_http",
      url: "https://example.com/mcp",
    });

    await expect(readMcpServer("github")).resolves.toMatchObject({
      name: "github",
      transport: "streamable_http",
      url: "https://example.com/mcp",
    });
  });

  it("deleteMcpServer elimina configuración existente", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-mcp-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await upsertMcpServer({
      name: "temporary",
      transport: "stdio",
      command: "node",
      args: [ "server.js" ],
    });

    await expect(deleteMcpServer("temporary")).resolves.toBe(true);
    await expect(readMcpServer("temporary")).resolves.toBeNull();
    await expect(deleteMcpServer("temporary")).resolves.toBe(false);
  });

  it("rechaza stdio sin command", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-mcp-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await expect(
      upsertMcpServer({
        name: "bad-stdio",
        transport: "stdio",
      }),
    ).rejects.toThrow(
      'MCP server "bad-stdio" with stdio transport requires command.',
    );
  });

  it("rechaza transportes remotos sin url", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-mcp-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await expect(
      upsertMcpServer({
        name: "bad-sse",
        transport: "sse",
      }),
    ).rejects.toThrow(
      'MCP server "bad-sse" with sse transport requires url.',
    );
  });

  it("normaliza archivo corrupto o inválido como lista vacía", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-mcp-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await mkdir(join(tempDir, "mcp"), {
      recursive: true,
    });

    await writeFile(
      getMcpServersFilePath(),
      JSON.stringify({
        servers: [
          null,
          {
            name: "",
          },
        ],
      }),
      "utf8",
    );

    await expect(listMcpServers()).resolves.toEqual([]);
  });

  it("rechaza nombres inválidos", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-mcp-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await expect(
      upsertMcpServer({
        name: "../bad",
        transport: "stdio",
        command: "node",
      }),
    ).rejects.toThrow('Invalid MCP server name "../bad".');
  });
});