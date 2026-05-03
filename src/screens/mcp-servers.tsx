import { Box, Text, useInput } from "ink";
import { MultilineTextInput } from "../components/multiline-text-input.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteMcpServer,
  listMcpServers,
  upsertMcpServer,
  type McpServerConfig,
  type McpServerConfigInput,
  type McpServerScope,
  type McpServerTransport,
} from "../extensibility/mcp/index.js";

type McpServersScreenProps = {
  onBack: () => void;
};

type ScreenMode = "list" | "select_transport" | "form" | "paste_json";

type FormIntent = "add" | "edit";

type TransportMenuOption = McpServerTransport | "paste_json";

type DraftState = {
  name: string;
  enabled: string;
  scope: string;
  timeoutMs: string;
  command: string;
  argsJson: string;
  envJson: string;
  url: string;
  headersJson: string;
};

type DraftField = {
  key: keyof DraftState;
  label: string;
  description: string;
  placeholder: string;
};

const transports: McpServerTransport[] = ["stdio", "sse", "streamable_http"];

const transportMenuOptions: TransportMenuOption[] = [
  ...transports,
  "paste_json",
];

const emptyDraft: DraftState = {
  name: "",
  enabled: "true",
  scope: "project",
  timeoutMs: "30000",
  command: "",
  argsJson: "[]",
  envJson: "{}",
  url: "",
  headersJson: "{}",
};

function createDraftFields(transport: McpServerTransport): DraftField[] {
  const baseFields: DraftField[] = [
    {
      key: "name",
      label: "name",
      description: "Nombre estable del servidor MCP.",
      placeholder: "postgres_local",
    },
    {
      key: "enabled",
      label: "enabled",
      description: "true o false.",
      placeholder: "true",
    },
    {
      key: "scope",
      label: "scope",
      description: "project o global.",
      placeholder: "project",
    },
    {
      key: "timeoutMs",
      label: "timeoutMs",
      description: "Timeout en milisegundos.",
      placeholder: "30000",
    },
  ];

  if (transport === "stdio") {
    return [
      ...baseFields,
      {
        key: "command",
        label: "command",
        description: "Comando ejecutable.",
        placeholder: "node",
      },
      {
        key: "argsJson",
        label: "args",
        description: "JSON array de strings.",
        placeholder: '["/path/to/server/index.js"]',
      },
      {
        key: "envJson",
        label: "env",
        description: "JSON object string:string.",
        placeholder: '{"DEBUG":"true"}',
      },
    ];
  }

  return [
    ...baseFields,
    {
      key: "url",
      label: "url",
      description: "URL del servidor MCP remoto.",
      placeholder: "https://example.com/mcp",
    },
    {
      key: "headersJson",
      label: "headers",
      description: "JSON object string:string.",
      placeholder: '{"Authorization":"Bearer token"}',
    },
  ];
}

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function parseBoolean(value: string): boolean {
  return value.trim().toLowerCase() !== "false";
}

function parseScope(value: string): McpServerScope {
  return value.trim().toLowerCase() === "global" ? "global" : "project";
}

function parseTimeoutMs(value: string): number {
  const parsed = Number(value.trim());

  if (!Number.isFinite(parsed)) {
    throw new Error("timeoutMs must be a valid number.");
  }

  return Math.round(parsed);
}

function parseStringArrayJson(value: string): string[] {
  const trimmed = value.trim();

  if (!trimmed) {
    return [];
  }

  const parsed = JSON.parse(trimmed) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("args must be a JSON array.");
  }

  return parsed.map((item) => {
    if (typeof item !== "string") {
      throw new Error("args must contain only strings.");
    }

    return item;
  });
}

function parseStringRecordJson(value: string): Record<string, string> {
  const trimmed = value.trim();

  if (!trimmed) {
    return {};
  }

  const parsed = JSON.parse(trimmed) as unknown;

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("JSON value must be an object.");
  }

  return Object.fromEntries(
    Object.entries(parsed).map(([key, item]) => {
      if (typeof item !== "string") {
        throw new Error(`Value for "${key}" must be a string.`);
      }

      return [key, item];
    }),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTransportFromJson(value: unknown): McpServerTransport | null {
  if (value === "stdio" || value === "sse" || value === "streamable_http") {
    return value;
  }

  return null;
}

function normalizeStringArrayFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeStringRecordFromJson(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => {
        const [key, recordValue] = entry;

        return Boolean(key.trim()) && typeof recordValue === "string";
      })
      .map(([key, recordValue]) => [key.trim(), recordValue]),
  );
}

function normalizeTimeoutFromJson(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  return undefined;
}

function normalizeStartupTimeoutFromJson(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 1000);
  }

  return undefined;
}

function parsePastedMcpServersJson(value: string): McpServerConfigInput[] {
  const parsed = JSON.parse(value.trim()) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("Pasted MCP JSON must be an object.");
  }

  const rawServers = isRecord(parsed.mcpServers)
    ? parsed.mcpServers
    : isRecord(parsed.servers)
      ? parsed.servers
      : null;

  if (!rawServers) {
    throw new Error('Pasted MCP JSON must contain "mcpServers" or "servers".');
  }

  const entries = Object.entries(rawServers);

  if (entries.length === 0) {
    throw new Error("Pasted MCP JSON does not contain MCP servers.");
  }

  return entries.map(([name, rawConfig]) => {
    if (!isRecord(rawConfig)) {
      throw new Error(`MCP server "${name}" must be an object.`);
    }

    const transport = normalizeTransportFromJson(
      rawConfig.transport ?? rawConfig.type,
    );

    if (!transport) {
      throw new Error(
        `MCP server "${name}" requires transport/type stdio, sse or streamable_http.`,
      );
    }

    const timeoutMs =
      normalizeTimeoutFromJson(rawConfig.timeoutMs) ??
      normalizeStartupTimeoutFromJson(rawConfig.startup_timeout_sec);

    const baseInput = {
      name,
      enabled:
        typeof rawConfig.enabled === "boolean" ? rawConfig.enabled : true,
      transport,
      scope:
        rawConfig.scope === "global"
          ? ("global" as const)
          : ("project" as const),
      timeoutMs,
    };

    if (transport === "stdio") {
      if (typeof rawConfig.command !== "string" || !rawConfig.command.trim()) {
        throw new Error(`MCP stdio server "${name}" requires command.`);
      }

      return {
        ...baseInput,
        command: rawConfig.command.trim(),
        args: normalizeStringArrayFromJson(rawConfig.args),
        env: normalizeStringRecordFromJson(rawConfig.env),
        url: null,
        headers: {},
      };
    }

    if (typeof rawConfig.url !== "string" || !rawConfig.url.trim()) {
      throw new Error(`MCP ${transport} server "${name}" requires url.`);
    }

    return {
      ...baseInput,
      command: null,
      args: [],
      env: {},
      url: rawConfig.url.trim(),
      headers: normalizeStringRecordFromJson(rawConfig.headers),
    };
  });
}

function createDraftFromServer(server: McpServerConfig): DraftState {
  return {
    name: server.name,
    enabled: String(server.enabled),
    scope: server.scope,
    timeoutMs: String(server.timeoutMs),
    command: server.command ?? "",
    argsJson: safeJson(server.args),
    envJson: safeJson(server.env),
    url: server.url ?? "",
    headersJson: safeJson(server.headers),
  };
}

function createInputFromDraft({
  transport,
  draft,
}: {
  transport: McpServerTransport;
  draft: DraftState;
}): McpServerConfigInput {
  const name = draft.name.trim();

  if (!name) {
    throw new Error("name is required.");
  }

  const baseInput = {
    name,
    enabled: parseBoolean(draft.enabled),
    transport,
    scope: parseScope(draft.scope),
    timeoutMs: parseTimeoutMs(draft.timeoutMs),
  };

  if (transport === "stdio") {
    const command = draft.command.trim();

    if (!command) {
      throw new Error("command is required for stdio MCP servers.");
    }

    return {
      ...baseInput,
      command,
      args: parseStringArrayJson(draft.argsJson),
      env: parseStringRecordJson(draft.envJson),
      url: null,
      headers: {},
    };
  }

  const url = draft.url.trim();

  if (!url) {
    throw new Error(`url is required for ${transport} MCP servers.`);
  }

  return {
    ...baseInput,
    command: null,
    args: [],
    env: {},
    url,
    headers: parseStringRecordJson(draft.headersJson),
  };
}

function formatSummary(server: McpServerConfig): string {
  const target =
    server.transport === "stdio"
      ? `command: ${server.command ?? "none"}`
      : `url: ${server.url ?? "none"}`;

  return `${server.transport} · ${server.scope} · ${target}`;
}

function formatStatus(server: McpServerConfig): string {
  return server.enabled ? "enabled" : "disabled";
}

function formatFullConfig(server: McpServerConfig): string {
  const config =
    server.transport === "stdio"
      ? {
          [server.name]: {
            type: "stdio",
            command: server.command,
            args: server.args,
            env: server.env,
            enabled: server.enabled,
            scope: server.scope,
            timeoutMs: server.timeoutMs,
          },
        }
      : {
          [server.name]: {
            transport: server.transport,
            url: server.url,
            headers: server.headers,
            enabled: server.enabled,
            scope: server.scope,
            timeoutMs: server.timeoutMs,
          },
        };

  return safeJson({
    mcpServers: config,
  });
}

export function McpServersScreen({ onBack }: McpServersScreenProps) {
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [selectedServerIndex, setSelectedServerIndex] = useState(0);
  const [mode, setMode] = useState<ScreenMode>("list");
  const [intent, setIntent] = useState<FormIntent>("add");
  const [selectedTransportIndex, setSelectedTransportIndex] = useState(0);
  const [selectedFieldIndex, setSelectedFieldIndex] = useState(0);
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [pastedJson, setPastedJson] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDeleteName, setPendingDeleteName] = useState<string | null>(
    null,
  );
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedServer = servers[selectedServerIndex] ?? null;
  const selectedTransport = transports[selectedTransportIndex] ?? "stdio";

  const fields = useMemo(
    () => createDraftFields(selectedTransport),
    [selectedTransport],
  );

  const loadServers = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const nextServers = await listMcpServers();

      setServers(nextServers);
      setSelectedServerIndex((current) =>
        nextServers.length === 0
          ? 0
          : Math.min(current, nextServers.length - 1),
      );
    } catch (error_) {
      setError(
        error_ instanceof Error
          ? error_.message
          : "Unknown error loading MCP servers.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadServers();
  }, [loadServers]);

  const resetToList = useCallback(() => {
    setMode("list");
    setIntent("add");
    setDraft(emptyDraft);
    setSelectedFieldIndex(0);
    setSelectedTransportIndex(0);
    setPendingDeleteName(null);
  }, []);

  const beginAdd = useCallback(() => {
    setIntent("add");
    setDraft(emptyDraft);
    setSelectedTransportIndex(0);
    setSelectedFieldIndex(0);
    setStatus(null);
    setError(null);
    setMode("select_transport");
  }, []);

  const beginEdit = useCallback(() => {
    if (!selectedServer) {
      return;
    }

    const transportIndex = Math.max(
      0,
      transports.indexOf(selectedServer.transport),
    );

    setIntent("edit");
    setSelectedTransportIndex(transportIndex);
    setDraft(createDraftFromServer(selectedServer));
    setSelectedFieldIndex(0);
    setStatus(null);
    setError(null);
    setMode("form");
  }, [selectedServer]);

  const saveDraft = useCallback(async () => {
    setIsSaving(true);
    setStatus(null);
    setError(null);

    try {
      const input = createInputFromDraft({
        transport: selectedTransport,
        draft,
      });

      const saved = await upsertMcpServer(input);

      await loadServers();

      setStatus(`MCP server saved: ${saved.name}`);
      resetToList();
    } catch (error_) {
      setError(
        error_ instanceof Error
          ? error_.message
          : "Unknown error saving MCP server.",
      );
    } finally {
      setIsSaving(false);
    }
  }, [draft, loadServers, resetToList, selectedTransport]);

  const savePastedJson = useCallback(async () => {
    setIsSaving(true);
    setStatus(null);
    setError(null);

    try {
      const inputs = parsePastedMcpServersJson(pastedJson);

      for (const input of inputs) {
        await upsertMcpServer(input);
      }

      await loadServers();

      setStatus(
        inputs.length === 1
          ? `MCP server saved from JSON: ${inputs[0]!.name}`
          : `${inputs.length} MCP servers saved from JSON.`,
      );

      setPastedJson("");
      resetToList();
    } catch (error_) {
      setError(
        error_ instanceof Error
          ? error_.message
          : "Unknown error saving pasted MCP JSON.",
      );
    } finally {
      setIsSaving(false);
    }
  }, [loadServers, pastedJson, resetToList]);

  const confirmDelete = useCallback(async () => {
    if (!pendingDeleteName) {
      return;
    }

    setStatus(null);
    setError(null);

    try {
      const deleted = await deleteMcpServer(pendingDeleteName);

      await loadServers();

      setStatus(
        deleted
          ? `MCP server deleted: ${pendingDeleteName}`
          : `MCP server not found: ${pendingDeleteName}`,
      );
    } catch (error_) {
      setError(
        error_ instanceof Error
          ? error_.message
          : "Unknown error deleting MCP server.",
      );
    } finally {
      setPendingDeleteName(null);
    }
  }, [loadServers, pendingDeleteName]);

  useInput((input, key) => {
    if (pendingDeleteName) {
      const normalized = input.trim().toLowerCase();

      if (normalized === "y" || normalized === "s") {
        void confirmDelete();
        return;
      }

      if (normalized === "n" || key.escape) {
        setPendingDeleteName(null);
        setStatus("Delete cancelled.");
      }

      return;
    }

    if (mode === "list") {
      if (key.escape || input === "q") {
        onBack();
        return;
      }

      if (input === "r") {
        void loadServers();
        return;
      }

      if (input === "a") {
        beginAdd();
        return;
      }

      if (input === "e") {
        beginEdit();
        return;
      }

      if (input === "d" && selectedServer) {
        setPendingDeleteName(selectedServer.name);
        return;
      }

      if (key.upArrow || input === "k") {
        setSelectedServerIndex((current) =>
          servers.length === 0
            ? 0
            : current <= 0
              ? servers.length - 1
              : current - 1,
        );
        return;
      }

      if (key.downArrow || input === "j") {
        setSelectedServerIndex((current) =>
          servers.length === 0
            ? 0
            : current >= servers.length - 1
              ? 0
              : current + 1,
        );
      }

      return;
    }

    if (mode === "select_transport") {
      if (key.escape || input === "q") {
        resetToList();
        return;
      }

      if (key.upArrow || input === "k") {
        setSelectedTransportIndex((current) =>
          current <= 0 ? transportMenuOptions.length - 1 : current - 1,
        );
        return;
      }

      if (key.downArrow || input === "j") {
        setSelectedTransportIndex((current) =>
          current >= transportMenuOptions.length - 1 ? 0 : current + 1,
        );
        return;
      }

      if (key.return) {
        const selectedOption = transportMenuOptions[selectedTransportIndex];

        if (selectedOption === "paste_json") {
          setPastedJson("");
          setMode("paste_json");
          return;
        }

        setDraft(emptyDraft);
        setSelectedFieldIndex(0);
        setMode("form");
      }

      return;
    }

    if (mode === "paste_json") {
      if (key.escape) {
        setPastedJson("");
        resetToList();
        return;
      }

      if (key.ctrl && input.toLowerCase() === "s") {
        void savePastedJson();
      }

      return;
    }

    if (mode === "form") {
      if (key.escape) {
        resetToList();
        return;
      }

      if (key.ctrl && input.toLowerCase() === "s") {
        void saveDraft();
        return;
      }

      if (key.upArrow) {
        setSelectedFieldIndex((current) =>
          current <= 0 ? fields.length - 1 : current - 1,
        );
        return;
      }

      if (key.downArrow) {
        setSelectedFieldIndex((current) =>
          current >= fields.length - 1 ? 0 : current + 1,
        );
      }
    }
  });

  return (
    <Box width="100%" flexDirection="column" gap={1}>
      <Box flexDirection="column" alignItems="center">
        <Text bold>MCP servers</Text>
        <Text dimColor>
          Manage persisted MCP server configs. Runtime
          connection/discovery/execution is pending.
        </Text>
      </Box>

      {status ? <Text color="green">{status}</Text> : null}
      {error ? <Text color="red">Error: {error}</Text> : null}

      {pendingDeleteName ? (
        <Box borderStyle="round" borderColor="red" paddingX={1}>
          <Text>
            Delete MCP server <Text bold>{pendingDeleteName}</Text>? Press y/s
            to confirm or n/Esc to cancel.
          </Text>
        </Box>
      ) : null}

      {mode === "list" ? (
        <Box flexDirection="column" gap={1}>
          {isLoading ? <Text dimColor>Loading MCP servers...</Text> : null}

          {!isLoading && servers.length === 0 ? (
            <Box
              flexDirection="column"
              borderStyle="round"
              borderColor="gray"
              paddingX={1}>
              <Text dimColor>No MCP servers configured.</Text>
              <Text dimColor>
                Press a to add stdio, sse or streamable_http.
              </Text>
            </Box>
          ) : null}

          {!isLoading && servers.length > 0 ? (
            <Box flexDirection="column" gap={1}>
              {servers.map((server, index) => {
                const isSelected = index === selectedServerIndex;

                return (
                  <Box
                    key={server.name}
                    flexDirection="column"
                    borderStyle="round"
                    borderColor={server.enabled ? "green" : "gray"}
                    paddingX={1}>
                    <Box justifyContent="space-between">
                      <Text bold color={isSelected ? "cyan" : undefined}>
                        {isSelected ? "❯ " : "  "}
                        {server.name}
                      </Text>
                      <Text dimColor>{formatStatus(server)}</Text>
                    </Box>

                    <Text>{formatSummary(server)}</Text>

                    {isSelected ? (
                      <Box marginTop={1} flexDirection="column">
                        <Text bold>Full config</Text>
                        <Text>{formatFullConfig(server)}</Text>
                      </Box>
                    ) : null}
                  </Box>
                );
              })}
            </Box>
          ) : null}

          <Box marginTop={1} flexDirection="column">
            <Text dimColor>
              ↑/↓ or j/k select · a add · e edit · d delete · r reload · Esc/q
              back
            </Text>
          </Box>
        </Box>
      ) : null}

      {mode === "select_transport" ? (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="green"
          paddingX={1}>
          <Text bold>Select MCP transport</Text>
          <Text dimColor>
            Choose the type of MCP server to add, or paste an existing MCP JSON
            config.
          </Text>

          <Box marginTop={1} flexDirection="column">
            {transportMenuOptions.map((option, index) => {
              const isSelected = index === selectedTransportIndex;
              const label = option === "paste_json" ? "paste_json" : option;

              const description =
                option === "paste_json"
                  ? "Paste JSON with mcpServers"
                  : "Manual form";

              return (
                <Box key={option} flexDirection="column" marginBottom={1}>
                  <Text color={isSelected ? "cyan" : undefined}>
                    {isSelected ? "❯ " : "  "}
                    {label}
                  </Text>
                  <Text dimColor> {description}</Text>
                </Box>
              );
            })}
          </Box>

          <Box marginTop={1}>
            <Text dimColor>
              ↑/↓ or j/k select · Enter continue · Esc/q cancel
            </Text>
          </Box>
        </Box>
      ) : null}

      {mode === "paste_json" ? (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="green"
          paddingX={1}>
          <Text bold>Paste MCP JSON</Text>
          <Text dimColor>
            Paste JSON containing mcpServers. Use compact one-line JSON if your
            terminal does not handle multiline paste well.
          </Text>

          <Box marginTop={1} flexDirection="column">
            <Text dimColor>Example:</Text>
            <Text>
              {`{"mcpServers":{"my-server":{"type":"stdio","command":"node","args":["/path/to/server/index.js"],"env":{"DEBUG":"true"}}}}`}
            </Text>
          </Box>

          <Box
            marginTop={1}
            borderStyle="round"
            borderColor="cyan"
            paddingX={1}
            paddingY={1}>
            <MultilineTextInput
              value={pastedJson}
              placeholder='{"mcpServers":{"my-server":{"type":"stdio","command":"node","args":["server.js"]}}}'
              focus={mode === "paste_json"}
              minRows={3}
              maxRows={12}
              onChange={setPastedJson}
            />
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Text dimColor>
              Ctrl+s save · Alt+Enter/Shift+Enter newline · Esc cancel
            </Text>
            <Text dimColor>
              Supported: stdio, sse, streamable_http. Fields: type/transport,
              command, args, env, url, headers, timeoutMs, startup_timeout_sec.
            </Text>
          </Box>

          {isSaving ? <Text dimColor>Saving MCP JSON...</Text> : null}
        </Box>
      ) : null}

      {mode === "form" ? (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="green"
          paddingX={1}>
          <Box justifyContent="space-between">
            <Text bold>
              {intent === "add" ? "Add MCP server" : "Edit MCP server"}
            </Text>
            <Text dimColor>{selectedTransport}</Text>
          </Box>

          <Box marginTop={1} flexDirection="column">
            {fields.map((field, index) => {
              const isSelected = index === selectedFieldIndex;

              return (
                <Box
                  key={field.key}
                  flexDirection="column"
                  borderStyle={isSelected ? "round" : undefined}
                  borderColor={isSelected ? "cyan" : undefined}
                  paddingX={isSelected ? 1 : 0}
                  marginBottom={1}>
                  <Text bold color={isSelected ? "cyan" : undefined}>
                    {isSelected ? "❯ " : "  "}
                    {field.label}
                  </Text>
                  <Text dimColor>{field.description}</Text>

                  {isSelected ? (
                    <MultilineTextInput
                      value={draft[field.key]}
                      placeholder={field.placeholder}
                      focus={mode === "form" && isSelected}
                      minRows={
                        field.key === "argsJson" ||
                        field.key === "envJson" ||
                        field.key === "headersJson"
                          ? 3
                          : 1
                      }
                      maxRows={
                        field.key === "argsJson" ||
                        field.key === "envJson" ||
                        field.key === "headersJson"
                          ? 8
                          : 3
                      }
                      onChange={(value) => {
                        setDraft((current) => ({
                          ...current,
                          [field.key]: value,
                        }));
                      }}
                    />
                  ) : (
                    <Text>{draft[field.key] || field.placeholder}</Text>
                  )}
                </Box>
              );
            })}
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Text dimColor>
              ↑/↓ fields · type to edit selected field · Alt+Enter/Shift+Enter
              newline · Ctrl+s save · Esc cancel
            </Text>
            <Text dimColor>
              JSON fields must be valid JSON. Example args: ["server.js"],
              env/headers: &#123;"KEY":"value"&#125;
            </Text>
          </Box>

          {isSaving ? <Text dimColor>Saving MCP server...</Text> : null}
        </Box>
      ) : null}
    </Box>
  );
}
