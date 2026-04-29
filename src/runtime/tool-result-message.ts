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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getAgentSpawnExecutionStatus(result: ToolExecutionResult): string | null {
  if (!result.ok) {
    return null;
  }

  if (!isRecord(result.result)) {
    return null;
  }

  const execution = result.result.execution;

  if (!isRecord(execution)) {
    return null;
  }

  return typeof execution.status === "string" ? execution.status : null;
}

function buildAgentSpawnGuidance(result: ToolExecutionResult): string | null {
  const status = getAgentSpawnExecutionStatus(result);

  if (!status) {
    return null;
  }

  return [
    "Agent spawn result handling:",
    "- This tool result is the ground truth for the delegated subagent operation.",
    '- If execution.status is "stubbed", report only that the agent instance and task state were created. Do not invent a child-agent answer.',
    '- If execution.status is "background_queued", report only that the background task was queued. Do not claim that it executed, completed, inspected files, or produced a child-agent answer.',
    '- If execution.status is "completed", use execution.response as the actual child-agent result and summarize it for the user.',
    '- If execution.status is "failed", report the returned execution.error.',
    "- Do not claim that the child agent inspected files, used tools, executed commands, ran in background, or modified external state unless the tool result explicitly proves it.",
    `- Current execution.status: ${status}`,
  ].join("\n");
}

function buildToolSpecificGuidance({
  toolName,
  result,
}: {
  toolName: string;
  result: ToolExecutionResult;
}): string | null {
  if (toolName === "agent.spawn") {
    return buildAgentSpawnGuidance(result);
  }

  return null;
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

  const toolSpecificGuidance = buildToolSpecificGuidance({
    toolName,
    result,
  });

  return [
    "Orqent runtime executed a tool and returned this structured result.",
    "Use this result as ground truth. Do not claim anything beyond it.",
    toolSpecificGuidance ? "" : null,
    toolSpecificGuidance,
    "",
    "<tool_result>",
    safeJsonStringify(payload),
    "</tool_result>",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function buildToolResultMessage(
  input: BuildToolResultMessageInput,
): OllamaChatMessage {
  return {
    role: "user",
    content: buildToolResultContent(input),
  };
}