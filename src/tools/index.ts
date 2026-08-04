import { consoleExecTool } from "./builtin/console.js";
import {
  fsListTool,
  fsReadTool,
  fsReplaceTool,
  fsSearchTool,
  fsWriteTool,
} from "./builtin/filesystem.js";
import { gitDiffTool, gitLogTool, gitStatusTool } from "./builtin/git.js";
import { ToolRegistry } from "./registry.js";

export const builtinTools = [
  consoleExecTool,
  fsReadTool,
  fsListTool,
  fsSearchTool,
  fsWriteTool,
  fsReplaceTool,
  gitStatusTool,
  gitDiffTool,
  gitLogTool,
];

export function createBuiltinToolRegistry(): ToolRegistry {
  return new ToolRegistry(builtinTools);
}

export { ToolRegistry } from "./registry.js";
export type {
  ToolConfirmationRequest,
  ToolContext,
  ToolDefinition,
  AnyToolDefinition,
  ToolResult,
} from "./types.js";
