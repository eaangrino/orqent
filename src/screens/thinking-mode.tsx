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
    description: "No fuerza nada. Usa el comportamiento natural del modelo.",
  },
  {
    mode: "disabled",
    label: "Disabled",
    description:
      "Desactiva thinking cuando el modelo/API lo soporte. Más rápido.",
  },
  {
    mode: "enabled",
    label: "Enabled",
    description: "Activa thinking genérico cuando el modelo/API lo soporte.",
  },
  {
    mode: "low",
    label: "Low",
    description:
      "Razonamiento bajo. Útil para respuestas simples con algo de análisis.",
  },
  {
    mode: "medium",
    label: "Medium",
    description: "Razonamiento medio. Balance entre calidad y latencia.",
  },
  {
    mode: "high",
    label: "High",
    description: "Razonamiento alto. Más lento; úsalo para tareas difíciles.",
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
      <Text color="yellow">Modo de thinking / reasoning</Text>
      <Text dimColor>
        Controla si Orqent solicita razonamiento explícito al modelo.
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
          Actual: <Text color="green">{thinkingMode}</Text>
        </Text>
        <Text dimColor>↑/↓ o j/k para navegar</Text>
        <Text dimColor>Enter para seleccionar · Esc o q para volver</Text>
      </Box>
    </Box>
  );
}
