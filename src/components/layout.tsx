import { type ReactNode } from "react";
import { Box, Text, useWindowSize } from "ink";

type LayoutProps = {
  topLeftText: string;
  topRightText: string;
  footerLineA: string;
  footerLineB: string;
  footerLineBRightText: string;
  children: ReactNode;
};

const logoLines = [
  "  ____   ____   ___  _____ _   _ _____",
  " / __ \\ |  _ \\ / _ \\| ____| \\ | |_   _|",
  "| |  | || |_) | | | |  _| |  \\| | | |",
  "| |__| ||  _ <| |_| | |___| |\\  | | |",
  " \\____/ |_| \\_\\\\__\\_\\_____|_| \\_| |_|",
];

export function Layout({
  topLeftText,
  topRightText,
  footerLineA,
  footerLineB,
  footerLineBRightText,
  children,
}: LayoutProps) {
  const { columns, rows } = useWindowSize();

  return (
    <Box
      flexDirection="column"
      width={columns}
      height={rows}
      paddingX={2}
      paddingY={1}>
      <Box justifyContent="space-between">
        <Text dimColor>{topLeftText}</Text>
        <Text dimColor>{topRightText}</Text>
      </Box>

      <Box
        flexGrow={1}
        flexDirection="column"
        justifyContent="center"
        alignItems="center">
        <Text color="#FF8549" bold>
          O R Q E N T
        </Text>

        {logoLines.map((line) => (
          <Text key={line} color="#FF8549">
            {line}
          </Text>
        ))}

        <Box marginTop={1} flexDirection="column" alignItems="center">
          {children}
        </Box>
      </Box>

      <Box flexDirection="column">
        <Text dimColor>{footerLineA}</Text>

        <Box justifyContent="space-between">
          <Text dimColor>{footerLineB}</Text>
          <Text dimColor>{footerLineBRightText}</Text>
        </Box>
      </Box>
    </Box>
  );
}
