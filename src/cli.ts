import { readFile } from "node:fs/promises";
import meow from "meow";
import {
  getOllamaConfigFilePath,
  saveOllamaConfig,
} from "./models/ollama/storage.js";
import { DEFAULT_OLLAMA_CONFIG } from "./models/ollama/config.js";
import {
  listConfiguredMcpServerTools,
  listConfiguredMcpServerResources,
  listConfiguredMcpServerPrompts,
  connectConfiguredMcpServer,
  deleteMcpServer,
  listMcpServers,
  upsertMcpServer,
  type McpServerConfig,
  type McpServerScope,
  type McpServerTransport,
} from "./extensibility/mcp/index.js";

const helpText = `
  Usage
    $ orqent
    $ orqent resume <sessionId>
    $ orqent mcp list
    $ orqent mcp add <name> --transport <stdio|sse|streamable_http> [options]
    $ orqent mcp remove <name>
    $ orqent mcp ping <name> [--json]
    $ orqent mcp tools <name> [--json]
    $ orqent mcp resources <name> [--json]
    $ orqent mcp prompts <name> [--json]
    
  Options
    --help              Show help
    --version           Show version
    --reset             Reset the persisted configuration

  MCP options
    --include-disabled  Include disabled MCP servers in list output
    --transport         MCP transport: stdio, sse, streamable_http
    --command           Command for stdio MCP servers
    --arg               Repeatable command argument for stdio MCP servers
    --url               URL for sse or streamable_http MCP servers
    --header            Repeatable HTTP header as key=value
    --env               Repeatable environment variable as key=value
    --timeout-ms        Timeout in milliseconds
    --scope             Scope: project or global
    --disabled          Persist server as disabled
    --json              Print JSON output

  Examples
    $ orqent
    $ orqent resume session_00000000000000_00000000-0000-0000-0000-000000000000
    $ orqent --reset
    $ orqent mcp list
    $ orqent mcp add filesystem --transport stdio --command npx --arg -y --arg @modelcontextprotocol/server-filesystem --arg .
    $ orqent mcp add postgres_local --transport streamable_http --url http://127.0.0.1:6060/mcp --timeout-ms 20000 --header "Accept=application/json, text/event-stream"
    $ orqent mcp remove everything
    $ orqent mcp ping everything
    $ orqent mcp tools everything
    $ orqent mcp resources everything
    $ orqent mcp prompts everything
`;

type RunAppOptions = {
  resumeSessionId?: string;
};

type CliDeps = {
  argv?: string[];
  packageVersion?: string;
  runAppImpl?: (options?: RunAppOptions) => void | Promise<void>;
  resetStateImpl?: () => Promise<void>;
  logImpl?: (message: string) => void;
};

type CliFlags = {
  help?: boolean;
  version?: boolean;
  reset?: boolean;
  includeDisabled?: boolean;
  transport?: string;
  command?: string;
  arg?: string[];
  url?: string;
  header?: string[];
  env?: string[];
  timeoutMs?: number;
  scope?: string;
  disabled?: boolean;
  json?: boolean;
};

async function readPackageVersion() {
  try {
    const packageJsonUrl = new URL("../package.json", import.meta.url);
    const raw = await readFile(packageJsonUrl, "utf8");
    const parsed = JSON.parse(raw) as { version?: string };

    return parsed.version?.trim() || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function resetPersistedConfig() {
  await saveOllamaConfig(DEFAULT_OLLAMA_CONFIG);
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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

function normalizeScope(value: unknown): McpServerScope {
  return value === "global" ? "global" : "project";
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [ value.trim() ];
  }

  return [];
}

function parseKeyValueEntries(entries: string[]): Record<string, string> {
  const result: Record<string, string> = {};

  for (const entry of entries) {
    const separatorIndex = entry.indexOf("=");

    if (separatorIndex <= 0) {
      throw new Error(`Invalid key=value entry: ${entry}`);
    }

    const key = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1);

    if (!key) {
      throw new Error(`Invalid key=value entry: ${entry}`);
    }

    result[ key ] = value;
  }

  return result;
}

function toSafeMcpServerView(server: McpServerConfig) {
  return {
    name: server.name,
    enabled: server.enabled,
    transport: server.transport,
    scope: server.scope,
    target:
      server.transport === "stdio"
        ? server.command
          ? `command:${server.command}`
          : "command:none"
        : server.url
          ? `url:${server.url}`
          : "url:none",
    timeoutMs: server.timeoutMs,
    hasArgs: server.args.length > 0,
    hasEnv: Object.keys(server.env).length > 0,
    hasHeaders: Object.keys(server.headers).length > 0,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
  };
}

function formatMcpServerLine(server: McpServerConfig): string {
  const safeView = toSafeMcpServerView(server);
  const privateConfig = [
    safeView.hasArgs ? "args" : null,
    safeView.hasEnv ? "env" : null,
    safeView.hasHeaders ? "headers" : null,
  ]
    .filter(Boolean)
    .join(",");

  return [
    `${safeView.name}`,
    `enabled=${safeView.enabled}`,
    `transport=${safeView.transport}`,
    `scope=${safeView.scope}`,
    safeView.target,
    `timeoutMs=${safeView.timeoutMs}`,
    `private=${privateConfig || "none"}`,
  ].join(" · ");
}

async function handleMcpCommand({
  input,
  flags,
  logImpl,
}: {
  input: string[];
  flags: CliFlags;
  logImpl: (message: string) => void;
}): Promise<boolean> {
  const [ command, subcommand, name ] = input;

  if (command !== "mcp") {
    return false;
  }

  if (!subcommand || subcommand === "help") {
    logImpl(
      [
        "Using:",
        "  orqent mcp list [--include-disabled] [--json]",
        "  orqent mcp add <name> --transport <stdio|sse|streamable_http> [--command <cmd>] [--arg <value>] [--url <url>] [--header key=value] [--env key=value] [--timeout-ms <ms>] [--scope <project|global>] [--disabled] [--json]",
        "  orqent mcp remove <name> [--json]",
        "  orqent mcp ping <name> [--json]",
        "  orqent mcp tools <name> [--json]",
        "  orqent mcp resources <name> [--json]",
        "  orqent mcp prompts <name> [--json]",
      ].join("\n"),
    );
    return true;
  }

  if (subcommand === "list") {
    const servers = await listMcpServers();
    const visibleServers = flags.includeDisabled
      ? servers
      : servers.filter((server) => server.enabled);

    if (flags.json) {
      logImpl(
        JSON.stringify(
          {
            servers: visibleServers.map(toSafeMcpServerView),
            count: visibleServers.length,
          },
          null,
          2,
        ),
      );
      return true;
    }

    if (visibleServers.length === 0) {
      logImpl("No MCP servers configured.");
      return true;
    }

    logImpl(visibleServers.map(formatMcpServerLine).join("\n"));
    return true;
  }

  if (subcommand === "add" || subcommand === "upsert") {
    const serverName = normalizeString(name);

    if (!serverName) {
      logImpl("Using: orqent mcp add <name> --transport <stdio|sse|streamable_http>");
      return true;
    }

    const transport = normalizeTransport(flags.transport);

    if (!transport) {
      logImpl("Missing or invalid --transport. Use stdio, sse or streamable_http.");
      return true;
    }

    const commandValue = normalizeString(flags.command);
    const url = normalizeString(flags.url);

    if (transport === "stdio" && !commandValue) {
      logImpl("Missing --command for stdio MCP server.");
      return true;
    }

    if ((transport === "sse" || transport === "streamable_http") && !url) {
      logImpl(`Missing --url for ${transport} MCP server.`);
      return true;
    }

    const server = await upsertMcpServer({
      name: serverName,
      enabled: !flags.disabled,
      transport,
      command: commandValue,
      args: normalizeStringArray(flags.arg),
      env: parseKeyValueEntries(normalizeStringArray(flags.env)),
      url,
      headers: parseKeyValueEntries(normalizeStringArray(flags.header)),
      timeoutMs: flags.timeoutMs,
      scope: normalizeScope(flags.scope),
    });

    if (flags.json) {
      logImpl(
        JSON.stringify(
          {
            server: toSafeMcpServerView(server),
            message:
              "MCP server configuration persisted. Real MCP connection and tool discovery are not wired yet.",
          },
          null,
          2,
        ),
      );
      return true;
    }

    logImpl(
      [
        `MCP server persisted: ${server.name}`,
        formatMcpServerLine(server),
        "Note: real MCP connection, discovery and execution are not wired yet.",
      ].join("\n"),
    );
    return true;
  }

  if (subcommand === "remove" || subcommand === "delete") {
    const serverName = normalizeString(name);

    if (!serverName) {
      logImpl("Using: orqent mcp remove <name>");
      return true;
    }

    const deleted = await deleteMcpServer(serverName);

    if (flags.json) {
      logImpl(
        JSON.stringify(
          {
            name: serverName,
            deleted,
          },
          null,
          2,
        ),
      );
      return true;
    }

    logImpl(
      deleted
        ? `MCP server deleted: ${serverName}`
        : `MCP server not found: ${serverName}`,
    );
    return true;
  }

  if (subcommand === "ping" || subcommand === "connect") {
    const serverName = normalizeString(name);

    if (!serverName) {
      logImpl("Using: orqent mcp ping <name>");
      return true;
    }

    const startedAt = Date.now();

    try {
      const connected = await connectConfiguredMcpServer({
        name: serverName,
      });

      await connected.close();

      const latencyMs = Date.now() - startedAt;

      if (flags.json) {
        logImpl(
          JSON.stringify(
            {
              ok: true,
              name: connected.server.name,
              transport: connected.server.transport,
              latencyMs,
              message: "MCP server connected successfully.",
            },
            null,
            2,
          ),
        );
        return true;
      }

      logImpl(
        [
          `MCP server connected: ${connected.server.name}`,
          `transport=${connected.server.transport}`,
          `latencyMs=${latencyMs}`,
          "Note: discovery and tool execution are not wired yet.",
        ].join("\n"),
      );
    } catch (error_) {
      const message =
        error_ instanceof Error
          ? error_.message
          : "Unknown MCP connection error.";

      if (flags.json) {
        logImpl(
          JSON.stringify(
            {
              ok: false,
              name: serverName,
              error: message,
            },
            null,
            2,
          ),
        );
        return true;
      }

      logImpl(`MCP server connection failed: ${serverName}\n${message}`);
    }

    return true;
  }

  if (subcommand === "tools" || subcommand === "list-tools") {
    const serverName = normalizeString(name);

    if (!serverName) {
      logImpl("Using: orqent mcp tools <name>");
      return true;
    }

    try {
      const tools = await listConfiguredMcpServerTools({
        name: serverName,
      });

      if (flags.json) {
        logImpl(
          JSON.stringify(
            {
              server: serverName,
              count: tools.length,
              tools,
            },
            null,
            2,
          ),
        );
        return true;
      }

      if (tools.length === 0) {
        logImpl(`No MCP tools discovered for server: ${serverName}`);
        return true;
      }

      logImpl(
        [
          `MCP tools discovered for server: ${serverName}`,
          ...tools.map((tool) =>
            [
              `- ${tool.name}`,
              tool.description ? `  ${tool.description}` : null,
              tool.inputSchema
                ? `  inputSchema=${JSON.stringify(tool.inputSchema)}`
                : null,
            ]
              .filter((line): line is string => line !== null)
              .join("\n"),
          ),
          "",
          "Note: MCP tool execution is not wired yet.",
        ].join("\n"),
      );
    } catch (error_) {
      const message =
        error_ instanceof Error
          ? error_.message
          : "Unknown MCP tools discovery error.";

      if (flags.json) {
        logImpl(
          JSON.stringify(
            {
              ok: false,
              server: serverName,
              error: message,
            },
            null,
            2,
          ),
        );
        return true;
      }

      logImpl(`MCP tools discovery failed: ${serverName}\n${message}`);
    }

    return true;
  }

  if (subcommand === "resources" || subcommand === "list-resources") {
    const serverName = normalizeString(name);

    if (!serverName) {
      logImpl("Using: orqent mcp resources <name>");
      return true;
    }

    try {
      const resources = await listConfiguredMcpServerResources({
        name: serverName,
      });

      if (flags.json) {
        logImpl(
          JSON.stringify(
            {
              server: serverName,
              count: resources.length,
              resources,
            },
            null,
            2,
          ),
        );
        return true;
      }

      if (resources.length === 0) {
        logImpl(`No MCP resources discovered for server: ${serverName}`);
        return true;
      }

      logImpl(
        [
          `MCP resources discovered for server: ${serverName}`,
          ...resources.map((resource) =>
            [
              `- ${resource.uri}`,
              resource.name ? `  name=${resource.name}` : null,
              resource.description ? `  ${resource.description}` : null,
              resource.mimeType ? `  mimeType=${resource.mimeType}` : null,
            ]
              .filter((line): line is string => line !== null)
              .join("\n"),
          ),
          "",
          "Note: MCP resource reading is not wired yet.",
        ].join("\n"),
      );
    } catch (error_) {
      const message =
        error_ instanceof Error
          ? error_.message
          : "Unknown MCP resources discovery error.";

      if (flags.json) {
        logImpl(
          JSON.stringify(
            {
              ok: false,
              server: serverName,
              error: message,
            },
            null,
            2,
          ),
        );
        return true;
      }

      logImpl(`MCP resources discovery failed: ${serverName}\n${message}`);
    }

    return true;
  }

  if (subcommand === "prompts" || subcommand === "list-prompts") {
    const serverName = normalizeString(name);

    if (!serverName) {
      logImpl("Using: orqent mcp prompts <name>");
      return true;
    }

    try {
      const prompts = await listConfiguredMcpServerPrompts({
        name: serverName,
      });

      if (flags.json) {
        logImpl(
          JSON.stringify(
            {
              server: serverName,
              count: prompts.length,
              prompts,
            },
            null,
            2,
          ),
        );
        return true;
      }

      if (prompts.length === 0) {
        logImpl(`No MCP prompts discovered for server: ${serverName}`);
        return true;
      }

      logImpl(
        [
          `MCP prompts discovered for server: ${serverName}`,
          ...prompts.map((prompt) =>
            [
              `- ${prompt.name}`,
              prompt.description ? `  ${prompt.description}` : null,
              prompt.arguments.length > 0
                ? `  arguments=${JSON.stringify(prompt.arguments)}`
                : null,
            ]
              .filter((line): line is string => line !== null)
              .join("\n"),
          ),
          "",
          "Note: MCP prompt execution/rendering is not wired yet.",
        ].join("\n"),
      );
    } catch (error_) {
      const message =
        error_ instanceof Error
          ? error_.message
          : "Unknown MCP prompts discovery error.";

      if (flags.json) {
        logImpl(
          JSON.stringify(
            {
              ok: false,
              server: serverName,
              error: message,
            },
            null,
            2,
          ),
        );
        return true;
      }

      logImpl(`MCP prompts discovery failed: ${serverName}\n${message}`);
    }

    return true;
  }

  logImpl(`Unknown MCP subcommand: ${subcommand}`);
  return true;
}

export async function runCli(deps: CliDeps = {}) {
  const argv = deps.argv ?? process.argv.slice(2);
  const packageVersion = deps.packageVersion ?? (await readPackageVersion());
  const resetStateImpl = deps.resetStateImpl ?? resetPersistedConfig;
  const logImpl = deps.logImpl ?? console.log;

  const cli = meow(helpText, {
    importMeta: import.meta,
    argv,
    autoHelp: false,
    autoVersion: false,
    flags: {
      help: {
        type: "boolean",
        default: false,
      },
      version: {
        type: "boolean",
        default: false,
      },
      reset: {
        type: "boolean",
        default: false,
      },
      includeDisabled: {
        type: "boolean",
        default: false,
      },
      transport: {
        type: "string",
      },
      command: {
        type: "string",
      },
      arg: {
        type: "string",
        isMultiple: true,
        default: [],
      },
      url: {
        type: "string",
      },
      header: {
        type: "string",
        isMultiple: true,
        default: [],
      },
      env: {
        type: "string",
        isMultiple: true,
        default: [],
      },
      timeoutMs: {
        type: "number",
      },
      scope: {
        type: "string",
      },
      disabled: {
        type: "boolean",
        default: false,
      },
      json: {
        type: "boolean",
        default: false,
      },
    },
  });

  const flags = cli.flags as CliFlags;
  const [ command, value ] = cli.input;

  const handledMcpCommand = await handleMcpCommand({
    input: cli.input,
    flags,
    logImpl,
  });

  if (handledMcpCommand) {
    return;
  }

  if (command === "resume") {
    const resumeSessionId = value?.trim();

    if (!resumeSessionId) {
      logImpl("Using: orqent resume <sessionId>");
      return;
    }

    if (deps.runAppImpl) {
      await deps.runAppImpl({ resumeSessionId });
      return;
    }

    const { runApp } = await import("./run-app.js");
    runApp({ resumeSessionId });
    return;
  }

  if (flags.help) {
    logImpl(helpText.trim());
    return;
  }

  if (flags.version) {
    logImpl(packageVersion);
    return;
  }

  if (flags.reset) {
    await resetStateImpl();
    logImpl(`Configuration reset: ${getOllamaConfigFilePath()}`);
    return;
  }

  if (deps.runAppImpl) {
    await deps.runAppImpl();
    return;
  }

  const { runApp } = await import("./run-app.js");
  runApp();
}