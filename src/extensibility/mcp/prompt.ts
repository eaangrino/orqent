import type { McpServerConfig } from "./types.js";

type McpServerCatalogItem = {
  name: string;
  enabled: boolean;
  transport: string;
  scope: string;
  hasCommand: boolean;
  hasArgs: boolean;
  hasEnv: boolean;
  hasUrl: boolean;
  hasHeaders: boolean;
  timeoutMs: number;
};

function toCatalogItem(server: McpServerConfig): McpServerCatalogItem {
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
  };
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return JSON.stringify({
      error: "Value could not be serialized.",
    });
  }
}

export function buildMcpServerCatalogPrompt(
  servers: McpServerConfig[],
): string {
  const catalog = servers.map(toCatalogItem);

  return [
    "Configured MCP server catalog:",
    "",
    catalog.length > 0
      ? safeJsonStringify(catalog)
      : "No MCP servers are currently configured.",
    "",
    "MCP catalog rules:",
    "- These entries are local MCP server configurations known by the runtime.",
    "- This catalog only describes configured servers. It does not mean they are connected.",
    "- Do not claim an MCP server is connected, healthy, authenticated, or usable until the runtime provides a real connection/tool result.",
    "- Do not expose command arguments, environment variables, headers, URLs, tokens, secrets, or credentials in the user-facing answer.",
    "- hasEnv and hasHeaders only indicate that private configuration exists.",
    "- enabled=false means the server must not be used.",
    "- Current MCP implementation stage only persists and catalogs server configuration. Real MCP client connection, tool discovery, resources, prompts, and tool execution are not connected yet.",
    "- If the user asks to list configured MCP servers, you may summarize this catalog.",
    "- If the user asks to use an MCP tool right now, explain that MCP execution is not wired yet unless a runtime MCP tool result is provided.",
  ].join("\n");
}