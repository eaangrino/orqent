import { type ReactNode } from "react";
import { Box, Text } from "ink";
import { Menu } from "./menu.js";

type LayoutProps = {
  title: string;
  instructions: string;
  menuItems: string[];
  selectedIndex: number;
  activeLabel: string;
  footerHelp: readonly string[];
  children: ReactNode;
};

export function Layout({
  title,
  instructions,
  menuItems,
  selectedIndex,
  activeLabel,
  footerHelp,
  children,
}: LayoutProps) {
  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="column" borderStyle="round" paddingX={1} paddingY={0}>
        <Text color="green">{title}</Text>
        <Text>{instructions}</Text>
      </Box>

      <Menu items={menuItems} selectedIndex={selectedIndex} />

      <Box marginTop={1} borderStyle="round" paddingX={1}>
        <Text>
          Vista activa: <Text color="cyan">{activeLabel}</Text>
        </Text>
      </Box>

      <Box
        marginTop={1}
        flexDirection="column"
        borderStyle="round"
        paddingX={1}
        paddingY={0}>
        {children}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>{footerHelp.join(" • ")}</Text>
      </Box>
    </Box>
  );
}
