import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { SelectableList } from "../components/selectable-list.js";
import type { OllamaModelItem } from "../models/ollama/types.js";

type ModelSelectScreenProps = {
  models: OllamaModelItem[];
  selectedModel: string;
  isLoading: boolean;
  error: string | null;
  onSelectModel: (model: string) => void;
  onBack: () => void;
};

export function ModelSelectScreen({
  models,
  selectedModel,
  isLoading,
  error,
  onSelectModel,
  onBack,
}: ModelSelectScreenProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const nextIndex = Math.max(
      0,
      models.findIndex((model) => model.name === selectedModel),
    );

    setSelectedIndex(nextIndex);
  }, [models, selectedModel]);

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onBack();
      return;
    }

    if (isLoading || error || models.length === 0) {
      return;
    }

    if (key.upArrow || input === "k") {
      setSelectedIndex((current) =>
        current <= 0 ? models.length - 1 : current - 1,
      );
      return;
    }

    if (key.downArrow || input === "j") {
      setSelectedIndex((current) =>
        current >= models.length - 1 ? 0 : current + 1,
      );
      return;
    }

    if (key.return) {
      onSelectModel(models[selectedIndex]!.name);
    }
  });

  return (
    <Box
      width="100%"
      flexDirection="column"
      alignItems="center"
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      paddingY={1}>
      <Text color="yellow">Select a Model</Text>

      {isLoading ? (
        <Box marginTop={1} flexDirection="column" alignItems="center">
          <Text>Loading models from Ollama...</Text>
          <Text dimColor>Esc or q to go back</Text>
        </Box>
      ) : null}

      {!isLoading && error ? (
        <Box marginTop={1} flexDirection="column" alignItems="center">
          <Text color="red">Could not load models</Text>
          <Text dimColor>{error}</Text>
          <Text dimColor>
            Check the host in /config and ensure Ollama is running
          </Text>
          <Text dimColor>Esc or q to go back</Text>
        </Box>
      ) : null}

      {!isLoading && !error && models.length === 0 ? (
        <Box marginTop={1} flexDirection="column" alignItems="center">
          <Text>No models available</Text>
          <Text dimColor>Esc or q to go back</Text>
        </Box>
      ) : null}

      {!isLoading && !error && models.length > 0 ? (
        <>
          <Box marginTop={1} flexDirection="column" width="100%">
            <SelectableList
              items={models}
              selectedIndex={selectedIndex}
              getKey={(model) => model.name}
              isActive={(model) => model.name === selectedModel}
              renderItem={({ item: model, isSelected, isActive }) => (
                <Box
                  flexDirection="column"
                  marginBottom={1}
                  paddingX={1}
                  backgroundColor={isSelected ? "gray" : undefined}>
                  <Box>
                    <Text color={isSelected ? "black" : undefined}>
                      {isSelected ? "❯ " : "  "}
                    </Text>

                    <Text color={isActive ? "green" : "gray"}>
                      {isActive ? "● " : "○ "}
                    </Text>

                    <Text
                      color={isSelected ? "black" : undefined}
                      bold={isSelected || isActive}>
                      {model.name}
                    </Text>
                  </Box>

                  <Text dimColor={!isSelected}>
                    {[
                      model.family,
                      model.parameterSize,
                      model.quantizationLevel,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </Box>
              )}
            />
          </Box>

          <Box
            marginTop={1}
            flexDirection="column"
            alignItems="center"
            borderStyle="round"
            borderColor="gray"
            paddingX={1}>
            <Text>
              Focused:{" "}
              <Text color="yellow">{models[selectedIndex]?.name ?? "-"}</Text>
            </Text>
            <Text>
              Current: <Text color="green">{selectedModel}</Text>
            </Text>
            <Text dimColor>↑/↓ or j/k to navigate</Text>
            <Text dimColor>Enter to select · Esc or q to go back</Text>
          </Box>
        </>
      ) : null}
    </Box>
  );
}
