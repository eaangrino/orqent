import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import {
  listMcpServers,
  type McpServerConfig,
} from "../extensibility/mcp/index.js";

type McpServersScreenProps = {
  onBack: () => void;
};

function formatServerStatus(server: McpServerConfig): string {
  return server.enabled ? "enabled" : "disabled";
}

function formatServerTarget(server: McpServerConfig): string {
  if (server.transport === "stdio") {
    return server.command ? `command: ${server.command}` : "command: none";
  }

  return server.url ? `url: ${server.url}` : "url: none";
}

function formatPrivateConfig(server: McpServerConfig): string {
  const parts = [
    Object.keys(server.env).length > 0 ? "env" : null,
    Object.keys(server.headers).length > 0 ? "headers" : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "none";
}

export function McpServersScreen({ onBack }: McpServersScreenProps) {
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadServers() {
      setIsLoading(true);
      setError(null);

      try {
        const nextServers = await listMcpServers();

        if (!isCancelled) {
          setServers(nextServers);
        }
      } catch (error_) {
        if (!isCancelled) {
          setError(
            error_ instanceof Error
              ? error_.message
              : "Unknown error loading MCP servers.",
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadServers();

    return () => {
      isCancelled = true;
    };
  }, []);

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onBack();
    }
  });

  return (
    <Box width="100%" flexDirection="column" gap={1}>
      <Box flexDirection="column" alignItems="center">
        <Text bold>MCP servers</Text>
        <Text dimColor>
          Configured MCP servers. Connection, discovery and execution are not
          wired yet.
        </Text>
      </Box>

      {isLoading ? <Text dimColor>Loading MCP servers...</Text> : null}

      {error ? (
        <Text color="red">Error loading MCP servers: {error}</Text>
      ) : null}

      {!isLoading && !error && servers.length === 0 ? (
        <Box flexDirection="column">
          <Text dimColor>No MCP servers configured.</Text>
          <Text dimColor>
            Use natural language with mcp.upsert_server or edit
            ~/.orqent/mcp/servers.json.
          </Text>
        </Box>
      ) : null}

      {!isLoading && !error && servers.length > 0 ? (
        <Box flexDirection="column" gap={1}>
          {servers.map((server) => (
            <Box
              key={server.name}
              flexDirection="column"
              borderStyle="round"
              borderColor={server.enabled ? "green" : "gray"}
              paddingX={1}>
              <Box justifyContent="space-between">
                <Text bold>{server.name}</Text>
                <Text dimColor>{formatServerStatus(server)}</Text>
              </Box>

              <Text>
                transport: <Text color="cyan">{server.transport}</Text>
              </Text>
              <Text>scope: {server.scope}</Text>
              <Text>{formatServerTarget(server)}</Text>
              <Text>timeout: {server.timeoutMs}ms</Text>
              <Text>private config: {formatPrivateConfig(server)}</Text>

              <Text dimColor>
                This is persisted config only; it does not prove the server is
                connected.
              </Text>
            </Box>
          ))}
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text dimColor>Esc/q back · MCP runtime execution pending</Text>
      </Box>
    </Box>
  );
}
