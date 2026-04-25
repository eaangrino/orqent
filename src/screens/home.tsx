import { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput, useWindowSize } from "ink";
import TextInput from "ink-text-input";
import { SelectableList } from "../components/selectable-list.js";

type HomeUiState = {
  prompt: string;
  isSubmitting: boolean;
};

type HomeScreenProps = {
  onSlashCommand: (command: string) => boolean;
  onPromptSubmit: (prompt: string) => Promise<void>;
  promptStatus: string | null;
};

type SlashCommandItem = {
  label: string;
  description: string;
};

const initialState: HomeUiState = {
  prompt: "",
  isSubmitting: false,
};

const slashCommands: SlashCommandItem[] = [
  {
    label: "/config",
    description: "Abrir configuración",
  },
  {
    label: "/model",
    description: "Ver modelos disponibles",
  },
  {
    label: "/home",
    description: "Volver al inicio",
  },
];

export function HomeScreen({
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

      setState({
        prompt: "",
        isSubmitting: false,
      });
      setSelectedCommandIndex(0);
      return;
    }

    setState({
      prompt: "",
      isSubmitting: true,
    });

    setState({
      prompt: "",
      isSubmitting: true,
    });

    void onPromptSubmit(normalized).finally(() => {
      setState((current) => ({
        ...current,
        isSubmitting: false,
      }));
    });
  };

  const isShowingSlashCommands = state.prompt.trim().startsWith("/");

  return (
    <Box flexDirection="column" alignItems="center" width="100%">
      <Box
        width={inputWidth}
        borderStyle="round"
        borderColor="gray"
        backgroundColor="gray"
        paddingX={1}>
        <Box width="100%">
          <Box marginRight={1}>
            <Text color="black">❯</Text>
          </Box>

          <Box flexGrow={1}>
            <TextInput
              value={state.prompt}
              onChange={handleChange}
              onSubmit={handleSubmit}
              placeholder="Escribe una intención o un slash command..."
              focus
              showCursor
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
            emptyText="No hay comandos que coincidan."
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
          {state.isSubmitting
            ? "Enviando..."
            : (promptStatus ?? "Composer listo.")}
        </Text>
        <Text dimColor>/ para comandos · ↑/↓ navegar · Enter ejecutar</Text>
      </Box>
    </Box>
  );
}
