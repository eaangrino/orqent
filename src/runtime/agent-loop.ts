import type { PermissionPolicy } from "../security/index.js";
import {
  executeTool,
  type ToolActionLogger,
  type ToolConfirmationHandler,
  type ToolExecutionResult,
  type ToolRegistry,
  type ToolRuntimeContext,
} from "../tools/index.js";
import {
  parseModelToolCall,
  type ModelToolCall,
  type ParseModelToolCallOptions,
  type ToolCallParseResult,
} from "./tool-call-protocol.js";

export type ExecuteModelToolCallInput = {
  modelResponse: string;
  registry: ToolRegistry;
  sessionId: string;
  cwd?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  runtime?: ToolRuntimeContext;
  permissionPolicy?: PermissionPolicy;
  confirmToolExecution?: ToolConfirmationHandler;
  toolActionLogger?: ToolActionLogger;
  parseOptions?: ParseModelToolCallOptions;
};

export type ExecuteModelToolCallResult =
  | {
    kind: "none";
    parseResult: Extract<ToolCallParseResult, { kind: "none" }>;
  }
  | {
    kind: "invalid_tool_call";
    parseResult: Extract<ToolCallParseResult, { kind: "invalid" }>;
  }
  | {
    kind: "tool_call_executed";
    toolCall: ModelToolCall;
    executionResult: ToolExecutionResult;
  };

export async function executeModelToolCall({
  modelResponse,
  registry,
  sessionId,
  cwd,
  timeoutMs,
  signal,
  runtime,
  permissionPolicy,
  confirmToolExecution,
  toolActionLogger,
  parseOptions,
}: ExecuteModelToolCallInput): Promise<ExecuteModelToolCallResult> {
  const parseResult = parseModelToolCall(modelResponse, parseOptions);

  if (parseResult.kind === "none") {
    return {
      kind: "none",
      parseResult,
    };
  }

  if (parseResult.kind === "invalid") {
    return {
      kind: "invalid_tool_call",
      parseResult,
    };
  }

  const executionResult = await executeTool({
    registry,
    toolName: parseResult.toolCall.toolName,
    input: parseResult.toolCall.input,
    sessionId,
    cwd,
    timeoutMs,
    signal,
    runtime,
    permissionPolicy,
    confirmToolExecution,
    toolActionLogger,
  });

  return {
    kind: "tool_call_executed",
    toolCall: parseResult.toolCall,
    executionResult,
  };
}
