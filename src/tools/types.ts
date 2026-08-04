import type { PermissionMode } from "../config.js";
import type { JsonSchema, ResponseFunctionTool } from "../agent/protocol.js";

export type ToolRisk = "read" | "write" | "execute";

export type ToolContext = {
  rootDir: string;
  permissionMode: PermissionMode;
  signal: AbortSignal;
  maxOutputBytes: number;
  confirm: (request: ToolConfirmationRequest) => Promise<boolean>;
};

export type ToolConfirmationRequest = {
  name: string;
  description: string;
  risk: ToolRisk;
  arguments: unknown;
};

export type ToolSuccess = {
  ok: true;
  data: unknown;
  metadata?: Record<string, unknown>;
};

export type ToolFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: Record<string, unknown>;
};

export type ToolResult = ToolSuccess | ToolFailure;

export type ToolDefinition<TArgs = unknown> = {
  name: string;
  description: string;
  parameters: JsonSchema;
  risk: ToolRisk;
  parse: (value: unknown) => TArgs;
  execute: (args: TArgs, context: ToolContext) => Promise<ToolResult>;
};

export type AnyToolDefinition = ToolDefinition<any>;

export function toResponseTool(
  tool: AnyToolDefinition,
  strict: boolean,
): ResponseFunctionTool {
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    strict,
  };
}

export function toolError(
  code: string,
  message: string,
  details?: unknown,
): ToolFailure {
  return {
    ok: false,
    error: details === undefined ? { code, message } : { code, message, details },
  };
}
