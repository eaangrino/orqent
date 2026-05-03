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

function buildAgentRunBackgroundTaskGuidance(
  result: ToolExecutionResult,
): string | null {
  const status = getAgentSpawnExecutionStatus(result);

  if (!status) {
    return null;
  }

  return [
    "Agent background task result handling:",
    "- This tool result is the ground truth for the queued background subagent task execution.",
    '- If execution.status is "completed", use execution.response as the actual background subagent result and summarize it for the user.',
    '- If execution.status is "failed", report the returned execution.error.',
    "- Do not claim that the background task inspected files, used tools, executed commands, or modified external state unless the tool result explicitly proves it.",
    `- Current execution.status: ${status}`,
  ].join("\n");
}

function buildAgentInspectChildrenGuidance(
  result: ToolExecutionResult,
): string | null {
  if (!result.ok) {
    return null;
  }

  if (!isRecord(result.result)) {
    return null;
  }

  return [
    "Agent child inspection result handling:",
    "- This tool result is the ground truth for parent-child subagent coordination.",
    "- Summarize only the children, statuses, task ids, background task ids, results, errors, and transcript entries present in the tool result.",
    "- Do not invent users, conversations, dates, external tools, APIs, files, commands, or business data that are not present in the tool result.",
    "- If children is empty or count is 0, say that this parent session has no child subagent work.",
    "- If transcript entries are present, summarize their roles and relevant content. Do not pretend they came from the parent conversation.",
    "- If a child has completed result text, summarize that result as the child-agent output.",
    "- If a child is queued/running/failed, report that exact status.",
  ].join("\n");
}

function buildAgentInspectChildrenReadableResult(
  result: ToolExecutionResult,
): string | null {
  if (!result.ok || !isRecord(result.result)) {
    return null;
  }

  const summary =
    typeof result.result.summary === "string"
      ? result.result.summary.trim()
      : "";

  if (!summary) {
    return null;
  }

  return [
    "Agent child inspection readable result:",
    summary,
    "",
    "Answering rule:",
    "- Base the user-facing answer on the readable result above.",
    "- Mention child statuses, persisted result, and transcript availability exactly as shown.",
    "- Do not summarize this as a generic process execution.",
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

  if (toolName === "agent.run_background_task") {
    return buildAgentRunBackgroundTaskGuidance(result);
  }

  if (toolName === "agent.inspect_children") {
    return buildAgentInspectChildrenGuidance(result);
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

  const readableResult =
    toolName === "agent.inspect_children"
      ? buildAgentInspectChildrenReadableResult(result)
      : null;

  return [
    "Orqent runtime executed a tool and returned this structured result.",
    "Use this result as ground truth. Do not claim anything beyond it.",
    toolSpecificGuidance ? "" : null,
    toolSpecificGuidance,
    readableResult ? "" : null,
    readableResult,
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