import { type ReactNode } from "react";
import { Box, Text, useWindowSize } from "ink";

type LayoutProps = {
  topLeftText: string;
  topRightText: string;
  footerLineA: string;
  footerLineB: string;
  footerLineBRightText: string;
  hideBrand?: boolean;
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
  hideBrand = false,
  children,
}: LayoutProps) {
  const { columns } = useWindowSize();

  return (
    <Box flexDirection="column" width={columns} paddingX={2} paddingY={1}>
      <Box justifyContent="space-between">
        <Text dimColor>{topLeftText}</Text>
        <Text dimColor>{topRightText}</Text>
      </Box>

      <Box
        flexDirection="column"
        justifyContent={hideBrand ? "flex-start" : "center"}
        alignItems="center">
        {!hideBrand ? (
          <>
            <Text color="#FF8549" bold>
              O R Q E N T
            </Text>

            {logoLines.map((line) => (
              <Text key={line} color="#FF8549">
                {line}
              </Text>
            ))}
          </>
        ) : null}

        <Box
          marginTop={hideBrand ? 0 : 1}
          flexDirection="column"
          alignItems="center"
          width="100%">
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
