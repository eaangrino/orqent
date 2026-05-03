import { Box, Text } from "ink";
import type { ReactNode } from "react";

export type SelectableListRenderItemArgs<TItem> = {
  item: TItem;
  index: number;
  isSelected: boolean;
  isActive: boolean;
};

type SelectableListProps<TItem> = {
  items: TItem[];
  selectedIndex: number;
  getKey: (item: TItem, index: number) => string | number;
  isActive?: (item: TItem, index: number) => boolean;
  renderItem: (args: SelectableListRenderItemArgs<TItem>) => ReactNode;
  emptyText?: string;
};

export function SelectableList<TItem>({
  items,
  selectedIndex,
  getKey,
  isActive,
  renderItem,
  emptyText = "No items available",
}: SelectableListProps<TItem>) {
  if (items.length === 0) {
    return <Text dimColor>{emptyText}</Text>;
  }

  return (
    <Box flexDirection="column" width="100%">
      {items.map((item, index) => {
        const isSelected = index === selectedIndex;
        const active = isActive?.(item, index) ?? false;

        return (
          <Box key={getKey(item, index)} flexDirection="column">
            {renderItem({
              item,
              index,
              isSelected,
              isActive: active,
            })}
          </Box>
        );
      })}
    </Box>
  );
}
