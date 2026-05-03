import type { AnyToolDefinition } from "../tools/index.js";

export const TOOL_CALL_TAG_NAME = "orqent_tool_call";

export type ModelToolCall = {
  toolName: string;
  input: Record<string, unknown>;
  reason?: string;
};

export type ToolCallProtocolTool = {
  name: string;
  description: string;
  inputSchema: unknown;
  risk: string;
  permissions: string[];
  requiresConfirmation: boolean;
  isReadOnly: boolean;
};

export type ToolCallParseResult =
  | {
    kind: "none";
  }
  | {
    kind: "tool_call";
    toolCall: ModelToolCall;
    rawBlock: string;
    rawJson: string;
    outsideText?: string;
  }
  | {
    kind: "invalid";
    error: string;
    rawBlock?: string;
  };

export type ParseModelToolCallOptions = {
  allowSurroundingText?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toProtocolTool(tool: AnyToolDefinition): ToolCallProtocolTool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    risk: tool.risk,
    permissions: tool.permissions,
    requiresConfirmation: tool.requiresConfirmation,
    isReadOnly: tool.isReadOnly,
  };
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return JSON.stringify({
      error: "Value could not be serialized.",
    });
  }
}

function createToolCallPattern(): RegExp {
  return new RegExp(
    `<${TOOL_CALL_TAG_NAME}>\\s*([\\s\\S]*?)\\s*</${TOOL_CALL_TAG_NAME}>`,
    "g",
  );
}

function parseToolCallJson(rawJson: string): ToolCallParseResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    return {
      kind: "invalid",
      error:
        error instanceof Error
          ? `Invalid tool call JSON: ${error.message}`
          : "Invalid tool call JSON.",
    };
  }

  if (!isRecord(parsed)) {
    return {
      kind: "invalid",
      error: "Tool call payload must be a JSON object.",
    };
  }

  if (typeof parsed.toolName !== "string" || !parsed.toolName.trim()) {
    return {
      kind: "invalid",
      error: "Tool call requires a non-empty toolName string.",
    };
  }

  if (!isRecord(parsed.input)) {
    return {
      kind: "invalid",
      error: "Tool call input must be a JSON object.",
    };
  }

  if (parsed.reason !== undefined && typeof parsed.reason !== "string") {
    return {
      kind: "invalid",
      error: "Tool call reason must be a string when provided.",
    };
  }

  return {
    kind: "tool_call",
    toolCall: {
      toolName: parsed.toolName.trim(),
      input: parsed.input,
      reason: parsed.reason?.trim() || undefined,
    },
    rawBlock: "",
    rawJson,
  };
}

export function buildToolCatalogForModel(
  tools: AnyToolDefinition[],
): ToolCallProtocolTool[] {
  return tools.map(toProtocolTool);
}

export function buildToolCallProtocolInstructions(
  tools: AnyToolDefinition[],
): string {
  const toolCatalog = buildToolCatalogForModel(tools);

  return [
    "Tool calling protocol:",
    "",
    "You may request exactly one tool call when external runtime data or action is required.",
    "When requesting a tool call, output only this XML-like block and no prose:",
    "",
    `<${TOOL_CALL_TAG_NAME}>`,
    "{",
    '  "toolName": "tool.name",',
    '  "input": { "example": "arguments matching the tool input schema" },',
    '  "reason": "Short reason why this tool is needed."',
    "}",
    `</${TOOL_CALL_TAG_NAME}>`,
    "",
    "Rules:",
    "- Request at most one tool call per assistant turn.",
    "- Use only toolName values listed in the available tools catalog.",
    "- The input object must match the selected tool input schema.",
    "- Do not claim the tool was executed until the runtime provides a tool_result.",
    "- If no tool is needed, answer normally without a tool call block.",
    "- After receiving a tool_result, use it as ground truth. Then either answer the user or request one more tool call if strictly necessary.",
    "",
    "Available tools catalog:",
    safeJsonStringify(toolCatalog),
  ].join("\n");
}

export function parseModelToolCall(
  content: string,
  options: ParseModelToolCallOptions = {},
): ToolCallParseResult {
  const pattern = createToolCallPattern();
  const matches = Array.from(content.matchAll(pattern));

  if (matches.length === 0) {
    return {
      kind: "none",
    };
  }

  if (matches.length > 1) {
    return {
      kind: "invalid",
      error: "Model response contains more than one tool call block.",
    };
  }

  const match = matches[ 0 ]!;
  const rawBlock = match[ 0 ];
  const rawJson = match[ 1 ]?.trim() ?? "";
  const outsideBlock = content.replace(rawBlock, "").trim();

  if (outsideBlock.length > 0 && !options.allowSurroundingText) {
    return {
      kind: "invalid",
      error: "Tool call block must be the only content in the model response.",
      rawBlock,
    };
  }

  const parsed = parseToolCallJson(rawJson);

  if (parsed.kind === "invalid") {
    return {
      kind: "invalid",
      error: parsed.error,
      rawBlock,
    };
  }

  if (parsed.kind === "none") {
    return {
      kind: "invalid",
      error: "Tool call parser returned no payload inside a detected tool call block.",
      rawBlock,
    };
  }

  return {
    ...parsed,
    rawBlock,
    outsideText: outsideBlock || undefined,
  };
}
