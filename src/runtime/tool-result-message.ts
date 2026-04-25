import type { ToolExecutionResult } from "../tools/index.js";
import type { OllamaChatMessage } from "./ollama-runtime.js";

export type BuildToolResultMessageInput = {
  toolName: string;
  callId?: string;
  input?: unknown;
  result: ToolExecutionResult;
};

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return JSON.stringify({
      error: "Value could not be serialized.",
    });
  }
}

export function buildToolResultContent({
  toolName,
  callId,
  input,
  result,
}: BuildToolResultMessageInput): string {
  const payload = {
    type: "tool_result",
    toolName,
    callId: callId ?? null,
    ok: result.ok,
    input: input ?? null,
    result: result.ok ? result.result : null,
    error: result.ok ? null : result.error,
    metadata: result.metadata ?? null,
  };

  return [
    "Orqent runtime executed a tool and returned this structured result.",
    "Use this result as ground truth. Do not claim anything beyond it.",
    "",
    "<tool_result>",
    safeJsonStringify(payload),
    "</tool_result>",
  ].join("\n");
}

export function buildToolResultMessage(
  input: BuildToolResultMessageInput,
): OllamaChatMessage {
  return {
    role: "user",
    content: buildToolResultContent(input),
  };
}
