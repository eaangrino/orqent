import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Box, Text, useInput, useWindowSize } from "ink";
import { SelectableList } from "../components/selectable-list.js";
import { MultilineTextInput } from "../components/multiline-text-input.js";
import type { OllamaChatMessage } from "../runtime/index.js";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: string | null;
};

type HomeUiState = {
  prompt: string;
  isSubmitting: boolean;
  activeAssistantMessageId: string | null;
};

type HomeScreenProps = {
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  contextStatus: string;
  onSlashCommand: (command: string) => boolean;
  onPromptSubmit: (
    prompt: string,
    history: OllamaChatMessage[],
    onToken: (token: string) => void,
    onStatus: (status: string) => void,
    onReplaceContent: (content: string) => void,
  ) => Promise<string>;
  promptStatus: string | null;
};

type SlashCommandItem = {
  label: string;
  description: string;
};

const initialState: HomeUiState = {
  prompt: "",
  isSubmitting: false,
  activeAssistantMessageId: null,
};

const slashCommands: SlashCommandItem[] = [
  {
    label: "/config",
    description: "Open configuration",
  },
  {
    label: "/model",
    description: "View available models",
  },
  {
    label: "/params",
    description: "Configure generation parameters",
  },
  {
    label: "/thinking",
    description: "Configure reasoning mode",
  },
  {
    label: "/permissions",
    description: "Configure permission mode",
  },
  {
    label: "/mcp",
    description: "View configured MCP servers",
  },
  {
    label: "/exit",
    description: "Exit Orqent and print resume command",
  },
  {
    label: "/home",
    description: "Return to home",
  },
];

function createMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toOllamaChatHistory(messages: ChatMessage[]): OllamaChatMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

export function HomeScreen({
  messages,
  setMessages,
  contextStatus,
  onSlashCommand,
  onPromptSubmit,
  promptStatus,
}: HomeScreenProps) {
  const [state, setState] = useState<HomeUiState>(initialState);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const { columns } = useWindowSize();

  const inputWidth = useMemo(() => {
    const target = Math.floor(columns * 0.9);
    return Math.max(24, target);
  }, [columns]);

  const filteredSlashCommands = useMemo(() => {
    const normalized = state.prompt.trim().toLowerCase();

    if (!normalized.startsWith("/")) {
      return [];
    }

    return slashCommands.filter((command) =>
      command.label.startsWith(normalized),
    );
  }, [state.prompt]);

  useEffect(() => {
    setSelectedCommandIndex(0);
  }, [state.prompt]);

  useEffect(() => {
    if (selectedCommandIndex >= filteredSlashCommands.length) {
      setSelectedCommandIndex(0);
    }
  }, [filteredSlashCommands.length, selectedCommandIndex]);

  useInput((input, key) => {
    if (!state.prompt.trim().startsWith("/")) {
      return;
    }

    if (filteredSlashCommands.length === 0) {
      return;
    }

    if (key.upArrow) {
      setSelectedCommandIndex((current) =>
        current <= 0 ? filteredSlashCommands.length - 1 : current - 1,
      );
      return;
    }

    if (key.downArrow) {
      setSelectedCommandIndex((current) =>
        current >= filteredSlashCommands.length - 1 ? 0 : current + 1,
      );
      return;
    }

    if (key.escape) {
      setState((current) => ({
        ...current,
        prompt: "",
      }));
      setSelectedCommandIndex(0);
      return;
    }

    if (input === "\t") {
      const selected = filteredSlashCommands[selectedCommandIndex];

      if (!selected) {
        return;
      }

      setState((current) => ({
        ...current,
        prompt: selected.label,
      }));
    }
  });

  const handleChange = (value: string) => {
    setState((current) => ({
      ...current,
      prompt: value,
    }));
  };

  const handleSubmit = (value: string) => {
    const normalized = value.trim();

    if (!normalized) {
      return;
    }

    if (normalized.startsWith("/")) {
      const selected =
        filteredSlashCommands.length > 0
          ? filteredSlashCommands[selectedCommandIndex]
          : undefined;

      const commandToRun = selected?.label ?? normalized;
      onSlashCommand(commandToRun);

      setState((current) => ({
        ...current,
        prompt: "",
        isSubmitting: false,
      }));
      setSelectedCommandIndex(0);
      return;
    }

    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: "user",
      content: normalized,
    };

    const assistantMessageId = createMessageId();

    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      status: promptStatus ?? "Sending...",
    };

    const updateAssistantStatus = (status: string) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                status,
              }
            : message,
        ),
      );
    };

    const replaceAssistantContent = (content: string) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                content,
              }
            : message,
        ),
      );
    };

    setState((current) => ({
      ...current,
      prompt: "",
      isSubmitting: true,
      activeAssistantMessageId: assistantMessageId,
    }));

    setMessages((current) => [...current, userMessage, assistantMessage]);

    const chatHistory = toOllamaChatHistory(messages);

    void onPromptSubmit(
      normalized,
      chatHistory,
      (token) => {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content: `${message.content}${token}`,
                }
              : message,
          ),
        );
      },
      updateAssistantStatus,
      replaceAssistantContent,
    )
      .then((response) => {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content:
                    response.trim() ||
                    message.content.trim() ||
                    "(respuesta vacía)",
                }
              : message,
          ),
        );
      })
      .catch((error_) => {
        const message =
          error_ instanceof Error
            ? error_.message
            : "Error desconocido obteniendo respuesta de Ollama";

        setMessages((current) =>
          current.map((chatMessage) =>
            chatMessage.id === assistantMessageId
              ? {
                  ...chatMessage,
                  content: `Error: ${message}`,
                }
              : chatMessage,
          ),
        );
      })
      .finally(() => {
        setState((current) => ({
          ...current,
          isSubmitting: false,
          activeAssistantMessageId: null,
        }));
      });
  };

  const isShowingSlashCommands = state.prompt.trim().startsWith("/");

  return (
    <Box flexDirection="column" alignItems="center" width="100%">
      {messages.length > 0 ? (
        <Box
          width={inputWidth}
          flexDirection="column"
          marginBottom={1}
          borderStyle="round"
          borderColor="gray"
          paddingX={1}
          paddingY={1}>
          {messages.map((message) => {
            const isUser = message.role === "user";

            return (
              <Box
                key={message.id}
                flexDirection="column"
                marginBottom={1}
                paddingX={1}
                paddingY={1}
                backgroundColor={isUser ? "#4a4a4a" : "#2f2f2f"}>
                <Box justifyContent="space-between">
                  <Text color={isUser ? "cyan" : "green"} bold>
                    {isUser ? "User" : "Orqent"}
                  </Text>

                  {!isUser && message.status ? (
                    <Text dimColor>{message.status}</Text>
                  ) : null}
                </Box>

                <Text color="white">{message.content}</Text>
              </Box>
            );
          })}
        </Box>
      ) : null}

      <Box
        width={inputWidth}
        borderStyle="round"
        borderColor="gray"
        backgroundColor="gray"
        paddingX={1}
        paddingY={1}>
        <Box width="100%">
          <Box marginRight={1}>
            <Text color="black">❯</Text>
          </Box>

          <Box flexGrow={1}>
            <MultilineTextInput
              value={state.prompt}
              onChange={handleChange}
              onSubmit={handleSubmit}
              placeholder="Write a prompt or slash command..."
              focus
              minRows={1}
              maxRows={8}
            />
          </Box>
        </Box>
      </Box>

      {isShowingSlashCommands ? (
        <Box
          marginTop={1}
          width={inputWidth}
          flexDirection="column"
          borderStyle="round"
          borderColor="gray"
          paddingX={1}>
          <SelectableList
            items={filteredSlashCommands}
            selectedIndex={selectedCommandIndex}
            getKey={(command) => command.label}
            emptyText="There are no matching commands."
            renderItem={({ item: command, isSelected }) => (
              <Box justifyContent="space-between">
                <Text color={isSelected ? "cyan" : undefined}>
                  {isSelected ? "❯ " : "  "}
                  {command.label}
                </Text>
                <Text dimColor>{command.description}</Text>
              </Box>
            )}
          />
        </Box>
      ) : null}

      <Box marginTop={1} flexDirection="column" alignItems="center">
        <Text dimColor>
          / for commands · ↑/↓ to navigate · Enter to execute
        </Text>
        <Text dimColor>{contextStatus}</Text>
      </Box>
    </Box>
  );
}
