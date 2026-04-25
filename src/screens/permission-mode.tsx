import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { SelectableList } from "../components/selectable-list.js";
import type { PermissionMode } from "../security/index.js";

type PermissionModeItem = {
  mode: PermissionMode;
  label: string;
  description: string;
};

type PermissionModeScreenProps = {
  permissionMode: PermissionMode;
  onChangePermissionMode: (mode: PermissionMode) => void;
  onBack: () => void;
};

const permissionModeItems: PermissionModeItem[] = [
  {
    mode: "ask",
    label: "Ask",
    description:
      "Secure default mode. Risky or mutable tools require confirmation before execution.",
  },
  {
    mode: "allow",
    label: "Allow",
    description:
      "Allows executing tools without confirmation except for explicit deny rules.",
  },
  {
    mode: "deny",
    label: "Deny",
    description:
      "Blocks all execution of tools. Useful for conversation without external actions.",
  },
];

export function PermissionModeScreen({
  permissionMode,
  onChangePermissionMode,
  onBack,
}: PermissionModeScreenProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const nextIndex = Math.max(
      0,
      permissionModeItems.findIndex((item) => item.mode === permissionMode),
    );

    setSelectedIndex(nextIndex);
  }, [permissionMode]);

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onBack();
      return;
    }

    if (key.upArrow || input === "k") {
      setSelectedIndex((current) =>
        current <= 0 ? permissionModeItems.length - 1 : current - 1,
      );
      return;
    }

    if (key.downArrow || input === "j") {
      setSelectedIndex((current) =>
        current >= permissionModeItems.length - 1 ? 0 : current + 1,
      );
      return;
    }

    if (key.return) {
      onChangePermissionMode(permissionModeItems[selectedIndex]!.mode);
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
      <Text color="yellow">Permission Mode</Text>
      <Text dimColor>Control how Orqent authorizes tool execution.</Text>

      <Box marginTop={1} flexDirection="column" width="100%">
        <SelectableList
          items={permissionModeItems}
          selectedIndex={selectedIndex}
          getKey={(item) => item.mode}
          isActive={(item) => item.mode === permissionMode}
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
          Current: <Text color="green">{permissionMode}</Text>
        </Text>
        <Text dimColor>↑/↓ or j/k to navigate</Text>
        <Text dimColor>Enter to select · Esc or q to go back</Text>
      </Box>
    </Box>
  );
}
