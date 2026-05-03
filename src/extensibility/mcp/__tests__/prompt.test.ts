import { describe, expect, it } from "vitest";
import {
  buildMcpServerCatalogPrompt,
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
    env: {
      SECRET_TOKEN: "should-not-leak",
    },
    url: null,
    headers: {
      Authorization: "Bearer should-not-leak",
    },
    timeoutMs: 30_000,
    scope: "project",
    createdAt: "2026-04-29T00:00:00.000Z",
    updatedAt: "2026-04-29T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildMcpServerCatalogPrompt", () => {
  it("construye prompt cuando no hay servidores MCP configurados", () => {
    const prompt = buildMcpServerCatalogPrompt([]);

    expect(prompt).toContain("Configured MCP server catalog:");
    expect(prompt).toContain("No MCP servers are currently configured.");
    expect(prompt).toContain("MCP catalog rules:");
    expect(prompt).toContain("Real MCP client connection");
  });

  it("incluye metadata segura sin exponer secretos", () => {
    const prompt = buildMcpServerCatalogPrompt([
      createServer({
        name: "github",
        transport: "streamable_http",
        command: null,
        url: "https://example.com/mcp",
      }),
    ]);

    expect(prompt).toContain('"name": "github"');
    expect(prompt).toContain('"transport": "streamable_http"');
    expect(prompt).toContain('"hasEnv": true');
    expect(prompt).toContain('"hasHeaders": true');
    expect(prompt).toContain('"hasUrl": true');

    expect(prompt).not.toContain("should-not-leak");
    expect(prompt).not.toContain("SECRET_TOKEN");
    expect(prompt).not.toContain("Authorization");
    expect(prompt).not.toContain("https://example.com/mcp");
    expect(prompt).not.toContain("@modelcontextprotocol/server-filesystem");
  });

  it("incluye regla para no afirmar conexión real", () => {
    const prompt = buildMcpServerCatalogPrompt([ createServer() ]);

    expect(prompt).toContain(
      "It does not mean they are connected.",
    );
    expect(prompt).toContain(
      "Do not claim an MCP server is connected",
    );
    expect(prompt).toContain(
      "MCP execution is not wired yet",
    );
  });
});