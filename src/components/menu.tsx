import { Box, Text } from "ink";

type MenuProps = {
  items: string[];
  selectedIndex: number;
};

export function Menu({ items, selectedIndex }: MenuProps) {
  return (
    <Box flexDirection="column" marginTop={1}>
      {items.map((item, index) => {
        const isSelected = index === selectedIndex;

        return (
          <Text key={item} color={isSelected ? "cyan" : undefined}>
            {isSelected ? "❯ " : "  "}
            {item}
          </Text>
        );
      })}
    </Box>
  );
}
