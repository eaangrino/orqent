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
  " .88888.                                        dP   ",
  "d8'   `8b                                       88   ",
  "88     88 88d888b. .d8888b. .d8888b. 88d888b. d8888P ",
  "88     88 88'  `88 88'  `88 88ooood8 88'  `88   88   ",
  "Y8.   .8P 88       88.  .88 88.  ... 88    88   88   ",
  " `8888P'  dP       `8888P88 `88888P' dP    dP   dP   ",
  "                         88                          ",
  "                         dP                          ",
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
