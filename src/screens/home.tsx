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
import {
  getSkillMentionSuggestions,
  listSkillDefinitions,
  replaceActiveSkillMention,
  type SkillDefinition,
  type SkillMentionSuggestion,
} from "../extensibility/skills/index.js";
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
    label: "/skills",
    description: "View configured declarative skills",
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
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(0);
  const [inputCursorResetKey, setInputCursorResetKey] = useState(0);
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

  const filteredSkillMentions = useMemo(
    () =>
      getSkillMentionSuggestions({
        prompt: state.prompt,
        skills,
      }),
    [skills, state.prompt],
  );

  useEffect(() => {
    let isCancelled = false;

    async function loadSkills() {
      const nextSkills = await listSkillDefinitions();

      if (!isCancelled) {
        setSkills(nextSkills);
      }
    }

    void loadSkills();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    setSelectedCommandIndex(0);
    setSelectedSkillIndex(0);
  }, [state.prompt]);

  useEffect(() => {
    if (selectedCommandIndex >= filteredSlashCommands.length) {
      setSelectedCommandIndex(0);
    }
  }, [filteredSlashCommands.length, selectedCommandIndex]);

  useEffect(() => {
    if (selectedSkillIndex >= filteredSkillMentions.length) {
      setSelectedSkillIndex(0);
    }
  }, [filteredSkillMentions.length, selectedSkillIndex]);

  useInput((input, key) => {
    const isUsingSlashSuggestions =
      state.prompt.trim().startsWith("/") && filteredSlashCommands.length > 0;
    const isUsingSkillSuggestions = filteredSkillMentions.length > 0;

    if (!isUsingSlashSuggestions && !isUsingSkillSuggestions) {
      return;
    }

    if (isUsingSlashSuggestions) {
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
        setInputCursorResetKey((current) => current + 1);
        return;
      }

      if (input === "\t" || key.tab) {
        const selected = filteredSlashCommands[selectedCommandIndex];

        if (!selected) {
          return;
        }

        setState((current) => ({
          ...current,
          prompt: selected.label,
        }));
        setInputCursorResetKey((current) => current + 1);
      }

      return;
    }

    if (key.upArrow) {
      setSelectedSkillIndex((current) =>
        current <= 0 ? filteredSkillMentions.length - 1 : current - 1,
      );
      return;
    }

    if (key.downArrow) {
      setSelectedSkillIndex((current) =>
        current >= filteredSkillMentions.length - 1 ? 0 : current + 1,
      );
      return;
    }

    if (input === "\t" || key.tab) {
      const selected = filteredSkillMentions[selectedSkillIndex];

      if (!selected) {
        return;
      }

      setState((current) => ({
        ...current,
        prompt: replaceActiveSkillMention(current.prompt, selected.identifier),
      }));
      setInputCursorResetKey((current) => current + 1);
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
      setSelectedSkillIndex(0);
      setInputCursorResetKey((current) => current + 1);
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
    setInputCursorResetKey((current) => current + 1);

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

  const renderSkillMentionSuggestion = ({
    item,
    isSelected,
  }: {
    item: SkillMentionSuggestion;
    isSelected: boolean;
  }) => (
    <Box
      flexDirection="column"
      paddingX={1}
      backgroundColor={isSelected ? "gray" : undefined}>
      <Box>
        <Text color={isSelected ? "black" : undefined}>
          {isSelected ? "❯ " : "  "}
        </Text>
        <Text color={isSelected ? "black" : "cyan"}>
          @skill:{item.identifier}
        </Text>
      </Box>
      <Text dimColor={!isSelected}>{item.description}</Text>
    </Box>
  );

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
              <Box key={message.id} flexDirection="column" marginBottom={1}>
                <Text color={isUser ? "green" : "cyan"}>
                  {isUser ? "User" : "Orqent"}
                </Text>
                <Text>{message.content}</Text>
                {message.status ? <Text dimColor>{message.status}</Text> : null}
              </Box>
            );
          })}
        </Box>
      ) : null}

      {contextStatus ? (
        <Box width={inputWidth} marginBottom={1}>
          <Text dimColor>{contextStatus}</Text>
        </Box>
      ) : null}

      {promptStatus ? (
        <Box width={inputWidth} marginBottom={1}>
          <Text dimColor>{promptStatus}</Text>
        </Box>
      ) : null}

      {isShowingSlashCommands && filteredSlashCommands.length > 0 ? (
        <Box
          marginBottom={1}
          flexDirection="column"
          width={inputWidth}
          borderStyle="round"
          borderColor="gray"
          paddingX={1}>
          <Text dimColor>Commands · ↑/↓ navigate · Tab complete</Text>
          <SelectableList
            items={filteredSlashCommands}
            selectedIndex={selectedCommandIndex}
            getKey={(item) => item.label}
            renderItem={({ item, isSelected }) => (
              <Box
                flexDirection="column"
                paddingX={1}
                backgroundColor={isSelected ? "gray" : undefined}>
                <Box>
                  <Text color={isSelected ? "black" : undefined}>
                    {isSelected ? "❯ " : "  "}
                  </Text>
                  <Text color={isSelected ? "black" : "cyan"}>
                    {item.label}
                  </Text>
                </Box>
                <Text dimColor={!isSelected}>{item.description}</Text>
              </Box>
            )}
          />
        </Box>
      ) : null}

      {filteredSkillMentions.length > 0 ? (
        <Box
          marginBottom={1}
          flexDirection="column"
          width={inputWidth}
          borderStyle="round"
          borderColor="cyan"
          paddingX={1}>
          <Text dimColor>Skills · ↑/↓ navigate · Tab insert</Text>
          <SelectableList
            items={filteredSkillMentions}
            selectedIndex={selectedSkillIndex}
            getKey={(item) => item.identifier}
            renderItem={renderSkillMentionSuggestion}
          />
        </Box>
      ) : null}

      <Box
        width={inputWidth}
        borderStyle="round"
        borderColor="gray"
        paddingX={1}>
        <MultilineTextInput
          value={state.prompt}
          onChange={handleChange}
          onSubmit={handleSubmit}
          placeholder="Ask a question, type / for commands or @skill: for skills"
          width="100%"
          minRows={1}
          maxRows={6}
          disabled={state.isSubmitting}
          cursorResetKey={inputCursorResetKey}
        />
      </Box>
    </Box>
  );
}
