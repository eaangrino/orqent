import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { SelectableList } from "../components/selectable-list.js";
import type { OllamaThinkingMode } from "../models/ollama/types.js";

type ThinkingModeItem = {
  mode: OllamaThinkingMode;
  label: string;
  description: string;
};

type ThinkingModeScreenProps = {
  thinkingMode: OllamaThinkingMode;
  onChangeThinkingMode: (mode: OllamaThinkingMode) => void;
  onBack: () => void;
};

const thinkingModeItems: ThinkingModeItem[] = [
  {
    mode: "default",
    label: "Default",
    description:
      "It doesn't force anything. Use the natural behavior of the model.",
  },
  {
    mode: "disabled",
    label: "Disabled",
    description: "Disables thinking when the model/API supports it. Faster.",
  },
  {
    mode: "enabled",
    label: "Enabled",
    description: "Enables generic thinking when the model/API supports it.",
  },
  {
    mode: "low",
    label: "Low",
    description:
      "Low reasoning. Fast; good for simple tasks or when you want to save tokens.",
  },
  {
    mode: "medium",
    label: "Medium",
    description: "Medium reasoning. Balance between quality and latency.",
  },
  {
    mode: "high",
    label: "High",
    description: "High reasoning. Slower; use it for difficult tasks.",
  },
];

export function ThinkingModeScreen({
  thinkingMode,
  onChangeThinkingMode,
  onBack,
}: ThinkingModeScreenProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const nextIndex = Math.max(
      0,
      thinkingModeItems.findIndex((item) => item.mode === thinkingMode),
    );

    setSelectedIndex(nextIndex);
  }, [thinkingMode]);

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onBack();
      return;
    }

    if (key.upArrow || input === "k") {
      setSelectedIndex((current) =>
        current <= 0 ? thinkingModeItems.length - 1 : current - 1,
      );
      return;
    }

    if (key.downArrow || input === "j") {
      setSelectedIndex((current) =>
        current >= thinkingModeItems.length - 1 ? 0 : current + 1,
      );
      return;
    }

    if (key.return) {
      onChangeThinkingMode(thinkingModeItems[selectedIndex]!.mode);
      onBack();
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
      <Text color="yellow">Thinking / Reasoning Mode</Text>
      <Text dimColor>
        Controls whether Orqent requests explicit reasoning from the model.
      </Text>

      <Box marginTop={1} flexDirection="column" width="100%">
        <SelectableList
          items={thinkingModeItems}
          selectedIndex={selectedIndex}
          getKey={(item) => item.mode}
          isActive={(item) => item.mode === thinkingMode}
          renderItem={({ item, isSelected, isActive }) => (
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
                  {item.label}
                </Text>
              </Box>

              <Text dimColor={!isSelected}>{item.description}</Text>
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
          Current: <Text color="green">{thinkingMode}</Text>
        </Text>
        <Text dimColor>↑/↓ or j/k for navigation</Text>
        <Text dimColor>Enter to select · Esc or q to go back</Text>
      </Box>
    </Box>
  );
}
