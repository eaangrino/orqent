import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";

type MultilineTextInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  focus?: boolean;
  width?: number | string;
  minRows?: number;
  maxRows?: number;
  disabled?: boolean;
};

function normalizePastedInput(input: string): string {
  return input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function countLines(value: string): number {
  return Math.max(1, value.split("\n").length);
}

function insertAt(value: string, cursorOffset: number, text: string) {
  const safeCursorOffset = clamp(cursorOffset, 0, value.length);
  const nextValue =
    value.slice(0, safeCursorOffset) + text + value.slice(safeCursorOffset);

  return {
    nextValue,
    nextCursorOffset: safeCursorOffset + text.length,
  };
}

function deleteBeforeCursor(value: string, cursorOffset: number) {
  const safeCursorOffset = clamp(cursorOffset, 0, value.length);

  if (safeCursorOffset <= 0) {
    return {
      nextValue: value,
      nextCursorOffset: 0,
    };
  }

  return {
    nextValue:
      value.slice(0, safeCursorOffset - 1) + value.slice(safeCursorOffset),
    nextCursorOffset: safeCursorOffset - 1,
  };
}

function deleteAtCursor(value: string, cursorOffset: number) {
  const safeCursorOffset = clamp(cursorOffset, 0, value.length);

  if (safeCursorOffset >= value.length) {
    return {
      nextValue: value,
      nextCursorOffset: safeCursorOffset,
    };
  }

  return {
    nextValue:
      value.slice(0, safeCursorOffset) + value.slice(safeCursorOffset + 1),
    nextCursorOffset: safeCursorOffset,
  };
}

function getLineStartOffset(value: string, cursorOffset: number): number {
  const safeCursorOffset = clamp(cursorOffset, 0, value.length);
  const previousNewlineIndex = value.lastIndexOf("\n", safeCursorOffset - 1);

  return previousNewlineIndex === -1 ? 0 : previousNewlineIndex + 1;
}

function getLineEndOffset(value: string, cursorOffset: number): number {
  const safeCursorOffset = clamp(cursorOffset, 0, value.length);
  const nextNewlineIndex = value.indexOf("\n", safeCursorOffset);

  return nextNewlineIndex === -1 ? value.length : nextNewlineIndex;
}

function getDisplayValue({
  value,
  cursorOffset,
  placeholder,
  focus,
  disabled,
  maxRows,
}: {
  value: string;
  cursorOffset: number;
  placeholder: string;
  focus: boolean;
  disabled: boolean;
  maxRows: number;
}): string {
  if (!value) {
    return `${placeholder}${focus && !disabled ? "█" : ""}`;
  }

  const safeCursorOffset = clamp(cursorOffset, 0, value.length);
  const valueWithCursor =
    focus && !disabled
      ? `${value.slice(0, safeCursorOffset)}█${value.slice(safeCursorOffset)}`
      : value;

  const lines = valueWithCursor.split("\n");

  if (lines.length <= maxRows) {
    return valueWithCursor;
  }

  const cursorLineIndex =
    value.slice(0, safeCursorOffset).split("\n").length - 1;
  const startLineIndex = clamp(
    cursorLineIndex - maxRows + 1,
    0,
    Math.max(0, lines.length - maxRows),
  );

  return lines.slice(startLineIndex, startLineIndex + maxRows).join("\n");
}

export function MultilineTextInput({
  value,
  onChange,
  onSubmit,
  placeholder = "",
  focus = true,
  width = "100%",
  minRows = 1,
  maxRows = 8,
  disabled = false,
}: MultilineTextInputProps) {
  const [cursorOffset, setCursorOffset] = useState(value.length);

  useEffect(() => {
    setCursorOffset((current) => clamp(current, 0, value.length));
  }, [value.length]);

  useInput(
    (input, key) => {
      if (disabled) {
        return;
      }

      if (key.tab || input === "\t") {
        return;
      }

      if (key.leftArrow) {
        setCursorOffset((current) => clamp(current - 1, 0, value.length));
        return;
      }

      if (key.rightArrow) {
        setCursorOffset((current) => clamp(current + 1, 0, value.length));
        return;
      }

      if (key.ctrl && input.toLowerCase() === "a") {
        setCursorOffset(getLineStartOffset(value, cursorOffset));
        return;
      }

      if (key.ctrl && input.toLowerCase() === "e") {
        setCursorOffset(getLineEndOffset(value, cursorOffset));
        return;
      }

      if (key.return) {
        if (key.meta || key.shift) {
          const result = insertAt(value, cursorOffset, "\n");

          onChange(result.nextValue);
          setCursorOffset(result.nextCursorOffset);
          return;
        }

        onSubmit?.(value);
        return;
      }

      if (key.backspace) {
        const result = deleteBeforeCursor(value, cursorOffset);

        onChange(result.nextValue);
        setCursorOffset(result.nextCursorOffset);
        return;
      }

      if (key.delete) {
        const result = deleteAtCursor(value, cursorOffset);

        onChange(result.nextValue);
        setCursorOffset(result.nextCursorOffset);
        return;
      }

      if (key.ctrl && input.toLowerCase() === "u") {
        onChange("");
        setCursorOffset(0);
        return;
      }

      if (!input) {
        return;
      }

      const normalizedInput = normalizePastedInput(input);
      const result = insertAt(value, cursorOffset, normalizedInput);

      onChange(result.nextValue);
      setCursorOffset(result.nextCursorOffset);
    },
    {
      isActive: focus && !disabled,
    },
  );

  const rowCount = Math.max(minRows, Math.min(maxRows, countLines(value)));
  const displayValue = getDisplayValue({
    value,
    cursorOffset,
    placeholder,
    focus,
    disabled,
    maxRows,
  });

  return (
    <Box width={width} minHeight={rowCount} flexDirection="column">
      <Text dimColor={!value}>{displayValue}</Text>
    </Box>
  );
}
