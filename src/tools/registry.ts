import { searchFindTool, searchRgTool } from "./builtin/search.js";
import {
  filesystemListTool,
  filesystemReadTool,
  filesystemWriteTool,
  projectSearchTool,
} from "./builtin/filesystem.js";
import { shellExecuteTool } from "./builtin/shell.js";
import {
  dockerComposePsTool,
  dockerImagesTool,
  dockerInspectTool,
  dockerLogsTool,
  dockerNetworksTool,
  dockerPsTool,
  dockerVolumesTool,
} from "./builtin/docker.js";
import {
  gitBranchTool,
  gitDiffTool,
  gitLogTool,
  gitRemotesTool,
  gitShowTool,
  gitStatusTool,
} from "./builtin/git.js";
import type { AnyToolDefinition } from "./types.js";
import {
  agentCreateDefinitionTool,
  agentInspectChildrenTool,
  agentListBackgroundTasksTool,
  agentListDefinitionsTool,
  agentListTasksTool,
  agentReadTranscriptTool,
  agentRunBackgroundTaskTool,
  agentSpawnTool,
} from "./builtin/agents.js";
import {
  mcpCallToolTool,
  mcpDeleteServerTool,
  mcpListServersTool,
  mcpUpsertServerTool,
} from "./builtin/mcp.js";

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
  dockerPsTool,
  dockerInspectTool,
  dockerLogsTool,
  dockerComposePsTool,
  dockerImagesTool,
  dockerNetworksTool,
  dockerVolumesTool,
  gitStatusTool,
  gitDiffTool,
  gitLogTool,
  gitBranchTool,
  gitShowTool,
  gitRemotesTool,
  searchRgTool,
  searchFindTool,
  agentCreateDefinitionTool,
  agentListDefinitionsTool,
  agentSpawnTool,
  agentListTasksTool,
  agentReadTranscriptTool,
  agentListBackgroundTasksTool,
  agentRunBackgroundTaskTool,
  agentInspectChildrenTool,
  mcpListServersTool,
  mcpUpsertServerTool,
  mcpDeleteServerTool,
  mcpCallToolTool,
];

export const defaultToolRegistry = createToolRegistry(builtinTools);
