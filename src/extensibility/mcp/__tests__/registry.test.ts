import { describe, expect, it } from "vitest";
import {
  createMcpServerRegistry,
  type McpServerConfig,
} from "../index.js";

function createServer(
  overrides: Partial<McpServerConfig> = {},
): McpServerConfig {
  return {
    name: "filesystem",
    enabled: true,
    transport: "stdio",
    command: "npx",
    args: [ "-y", "@modelcontextprotocol/server-filesystem", "." ],
    env: {},
    url: null,
    headers: {},
    timeoutMs: 30_000,
    scope: "project",
    createdAt: "2026-04-29T00:00:00.000Z",
    updatedAt: "2026-04-29T00:00:00.000Z",
    ...overrides,
  };
}

describe("McpServerRegistry", () => {
  it("registra y obtiene servidores por nombre normalizado", () => {
    const registry = createMcpServerRegistry([
      createServer({
        name: "Filesystem",
      }),
    ]);

    expect(registry.has("filesystem")).toBe(true);
    expect(registry.has("FILESYSTEM")).toBe(true);
    expect(registry.get("filesystem")?.name).toBe("filesystem");
  });

  it("lista servidores ordenados por nombre", () => {
    const registry = createMcpServerRegistry([
      createServer({
        name: "github",
      }),
      createServer({
        name: "filesystem",
      }),
    ]);

    expect(registry.list().map((server) => server.name)).toEqual([
      "filesystem",
      "github",
    ]);
  });

  it("lista solo servidores enabled", () => {
    const registry = createMcpServerRegistry([
      createServer({
        name: "enabled-server",
        enabled: true,
      }),
      createServer({
        name: "disabled-server",
        enabled: false,
      }),
    ]);

    expect(registry.listEnabled().map((server) => server.name)).toEqual([
      "enabled-server",
    ]);
  });

  it("rechaza servidores duplicados", () => {
    expect(() =>
      createMcpServerRegistry([
        createServer({
          name: "filesystem",
        }),
        createServer({
          name: "FILESYSTEM",
        }),
      ]),
    ).toThrow('MCP server "FILESYSTEM" is already registered.');
  });

  it("rechaza nombres inválidos", () => {
    expect(() =>
      createMcpServerRegistry([
        createServer({
          name: "../bad",
        }),
      ]),
    ).toThrow('Invalid MCP server name "../bad".');
  });

  it("elimina servidores del registry en memoria", () => {
    const registry = createMcpServerRegistry([
      createServer({
        name: "temporary",
      }),
    ]);

    expect(registry.has("temporary")).toBe(true);
    expect(registry.delete("temporary")).toBe(true);
    expect(registry.has("temporary")).toBe(false);
    expect(registry.delete("temporary")).toBe(false);
  });
});