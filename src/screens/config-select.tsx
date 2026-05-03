import { Box, Text, useInput, useWindowSize } from "ink";
import TextInput from "ink-text-input";
import { useMemo, useState } from "react";

type ConfigSelectScreenProps = {
  selectedOllamaHost: string;
  onSelectEndpoint: (url: string) => void;
  onBack: () => void;
};

function isValidOllamaHost(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function ConfigSelectScreen({
  selectedOllamaHost,
  onSelectEndpoint,
  onBack,
}: ConfigSelectScreenProps) {
  const [draftHost, setDraftHost] = useState(selectedOllamaHost);
  const [error, setError] = useState<string | null>(null);
  const { columns } = useWindowSize();

  const inputWidth = useMemo(() => {
    const target = Math.floor(columns * 0.85);
    return Math.max(32, target);
  }, [columns]);

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onBack();
    }
  });

  const handleChange = (value: string) => {
    setDraftHost(value);

    if (error) {
      setError(null);
    }
  };

  const handleSubmit = (value: string) => {
    const normalized = value.trim();

    if (!normalized) {
      setError("El host de Ollama no puede estar vacío.");
      return;
    }

    if (!isValidOllamaHost(normalized)) {
      setError("Usa una URL válida. Ejemplo: http://localhost:11434");
      return;
    }

    onSelectEndpoint(normalized);
  };

  return (
    <Box
      width="100%"
      flexDirection="column"
      alignItems="center"
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      paddingY={1}>
      <Text color="yellow">Configurar Ollama Host</Text>
      <Text dimColor>Escribe la URL base del servidor Ollama.</Text>

      <Box marginTop={1} flexDirection="column" width={inputWidth}>
        <Text dimColor>Host actual:</Text>
        <Text color="green">{selectedOllamaHost}</Text>

        <Box
          marginTop={1}
          borderStyle="round"
          borderColor={error ? "red" : "gray"}
          backgroundColor="gray"
          paddingX={1}>
          <Box marginRight={1}>
            <Text color="black">❯</Text>
          </Box>

          <Box flexGrow={1}>
            <TextInput
              value={draftHost}
              onChange={handleChange}
              onSubmit={handleSubmit}
              placeholder="http://localhost:11434"
              focus
              showCursor
            />
          </Box>
        </Box>

        {error ? (
          <Box marginTop={1}>
            <Text color="red">{error}</Text>
          </Box>
        ) : null}
      </Box>

      <Box marginTop={1} flexDirection="column" alignItems="center">
        <Text dimColor>Enter para guardar</Text>
        <Text dimColor>Esc o q para volver sin cambiar</Text>
      </Box>
    </Box>
  );
}
