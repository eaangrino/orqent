import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { SelectableList } from "../components/selectable-list.js";
import { DEFAULT_OLLAMA_GENERATION_OPTIONS } from "../models/ollama/config.js";
import type { OllamaGenerationOptions } from "../models/ollama/types.js";

type GenerationOptionKey = keyof OllamaGenerationOptions;

type GenerationOptionItem = {
  key: GenerationOptionKey;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  integer?: boolean;
};

type GenerationOptionsScreenProps = {
  generationOptions: OllamaGenerationOptions;
  onChangeGenerationOptions: (options: OllamaGenerationOptions) => void;
  onBack: () => void;
};

const generationOptionItems: GenerationOptionItem[] = [
  {
    key: "temperature",
    label: "Temperature",
    description: "Creativity. Low = more deterministic, high = more varied.",
    min: 0,
    max: 2,
    step: 0.1,
  },
  {
    key: "topP",
    label: "Top P",
    description: "Nucleus sampling. Limits the accumulated probability mass.",
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: "topK",
    label: "Top K",
    description: "Maximum number of candidate tokens per step.",
    min: 1,
    max: 200,
    step: 1,
    integer: true,
  },
  {
    key: "numCtx",
    label: "Context window",
    description: "Maximum context tokens requested from Ollama.",
    min: 512,
    max: 262144,
    step: 1024,
    integer: true,
  },
  {
    key: "numPredict",
    label: "Max output tokens",
    description: "Maximum output tokens per response.",
    min: 1,
    max: 32768,
    step: 256,
    integer: true,
  },
  {
    key: "repeatPenalty",
    label: "Repeat penalty",
    description: "Penalty for repeating tokens.",
    min: 0.5,
    max: 2,
    step: 0.05,
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeValue(value: number, item: GenerationOptionItem) {
  const clamped = clamp(value, item.min, item.max);

  if (item.integer) {
    return Math.round(clamped);
  }

  return Number(clamped.toFixed(2));
}

function formatValue(value: number, item: GenerationOptionItem) {
  if (item.integer) {
    return String(Math.round(value));
  }

  return value.toFixed(2);
}

export function GenerationOptionsScreen({
  generationOptions,
  onChangeGenerationOptions,
  onBack,
}: GenerationOptionsScreenProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (selectedIndex >= generationOptionItems.length) {
      setSelectedIndex(0);
    }
  }, [selectedIndex]);

  const selectedItem = generationOptionItems[selectedIndex]!;

  const updateSelectedValue = (delta: number) => {
    const currentValue = generationOptions[selectedItem.key];
    const nextValue = normalizeValue(currentValue + delta, selectedItem);

    onChangeGenerationOptions({
      ...generationOptions,
      [selectedItem.key]: nextValue,
    });
  };

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onBack();
      return;
    }

    if (key.upArrow || input === "k") {
      setSelectedIndex((current) =>
        current <= 0 ? generationOptionItems.length - 1 : current - 1,
      );
      return;
    }

    if (key.downArrow || input === "j") {
      setSelectedIndex((current) =>
        current >= generationOptionItems.length - 1 ? 0 : current + 1,
      );
      return;
    }

    if (key.leftArrow || input === "h") {
      updateSelectedValue(-selectedItem.step);
      return;
    }

    if (key.rightArrow || input === "l") {
      updateSelectedValue(selectedItem.step);
      return;
    }

    if (input === "r") {
      onChangeGenerationOptions(DEFAULT_OLLAMA_GENERATION_OPTIONS);
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
      <Text color="yellow">Generation Parameters</Text>
      <Text dimColor>
        Adjusts how Ollama generates responses for the active model.
      </Text>

      <Box marginTop={1} flexDirection="column" width="100%">
        <SelectableList
          items={generationOptionItems}
          selectedIndex={selectedIndex}
          getKey={(item) => item.key}
          renderItem={({ item, isSelected }) => (
            <Box
              flexDirection="column"
              marginBottom={1}
              paddingX={1}
              backgroundColor={isSelected ? "gray" : undefined}>
              <Box justifyContent="space-between">
                <Text
                  color={isSelected ? "black" : undefined}
                  bold={isSelected}>
                  {isSelected ? "❯ " : "  "}
                  {item.label}
                </Text>

                <Text color={isSelected ? "black" : "green"}>
                  {formatValue(generationOptions[item.key], item)}
                </Text>
              </Box>

              <Text dimColor={!isSelected}>{item.description}</Text>
              <Text dimColor>
                min {item.min} · max {item.max} · step {item.step}
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
          Editing: <Text color="yellow">{selectedItem.label}</Text>
        </Text>
        <Text dimColor>↑/↓ or j/k for navigation</Text>
        <Text dimColor>←/→ or h/l to adjust</Text>
        <Text dimColor>r to reset · Esc or q to go back</Text>
      </Box>
    </Box>
  );
}
