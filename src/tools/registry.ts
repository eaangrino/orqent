import {
  filesystemListTool,
  filesystemReadTool,
  filesystemWriteTool,
  projectSearchTool,
} from "./builtin/filesystem.js";
import { shellExecuteTool } from "./builtin/shell.js";
import type { AnyToolDefinition } from "./types.js";

function normalizeToolName(name: string): string {
  return name.trim().toLowerCase();
}

function assertValidToolName(name: string): void {
  if (!name.trim()) {
    throw new Error("Tool name cannot be empty.");
  }

  if (!/^[a-z][a-z0-9:._-]*$/i.test(name)) {
    throw new Error(
      `Invalid tool name "${name}". Use letters, numbers, ":", ".", "_" or "-".`,
    );
  }
}

export class ToolRegistry {
  private readonly tools = new Map<string, AnyToolDefinition>();

  constructor(tools: AnyToolDefinition[] = []) {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  register(tool: AnyToolDefinition): void {
    assertValidToolName(tool.name);

    const normalizedName = normalizeToolName(tool.name);

    if (this.tools.has(normalizedName)) {
      throw new Error(`Tool "${tool.name}" is already registered.`);
    }

    this.tools.set(normalizedName, {
      ...tool,
      name: normalizedName,
    });
  }

  list(): AnyToolDefinition[] {
    return Array.from(this.tools.values());
  }

  get(name: string): AnyToolDefinition | undefined {
    return this.tools.get(normalizeToolName(name));
  }

  has(name: string): boolean {
    return this.tools.has(normalizeToolName(name));
  }
}

export function createToolRegistry(tools: AnyToolDefinition[] = []): ToolRegistry {
  return new ToolRegistry(tools);
}

export const builtinTools: AnyToolDefinition[] = [
  filesystemListTool,
  filesystemReadTool,
  filesystemWriteTool,
  projectSearchTool,
  shellExecuteTool,
];

export const defaultToolRegistry = createToolRegistry(builtinTools);
