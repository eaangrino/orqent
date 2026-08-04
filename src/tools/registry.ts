import { authorizeTool } from "../security/permissions.js";
import type { ResponseFunctionTool } from "../agent/protocol.js";
import type { AnyToolDefinition, ToolContext, ToolResult } from "./types.js";
import { toResponseTool, toolError } from "./types.js";

export class ToolRegistry {
  readonly #tools = new Map<string, AnyToolDefinition>();

  constructor(tools: readonly AnyToolDefinition[] = []) {
    for (const tool of tools) this.register(tool);
  }

  register(tool: AnyToolDefinition): void {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(tool.name)) {
      throw new Error(`Nombre de tool inválido: ${tool.name}`);
    }
    if (this.#tools.has(tool.name)) {
      throw new Error(`Tool duplicada: ${tool.name}`);
    }
    this.#tools.set(tool.name, tool);
  }

  list(): AnyToolDefinition[] {
    return [...this.#tools.values()];
  }

  toResponseTools(strict: boolean): ResponseFunctionTool[] {
    return this.list().map((tool) => toResponseTool(tool, strict));
  }

  async execute(
    name: string,
    rawArguments: unknown,
    context: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.#tools.get(name);
    if (!tool) return toolError("tool_not_found", `Tool desconocida: ${name}`);

    let parsed: unknown;
    try {
      parsed = tool.parse(rawArguments);
    } catch (error) {
      return toolError(
        "invalid_arguments",
        error instanceof Error ? error.message : "Argumentos inválidos.",
      );
    }

    const blocked = await authorizeTool(tool, parsed, context);
    if (blocked) return blocked;

    try {
      return await tool.execute(parsed, context);
    } catch (error) {
      return toolError(
        context.signal.aborted ? "tool_aborted" : "tool_execution_failed",
        error instanceof Error ? error.message : "Error desconocido ejecutando tool.",
      );
    }
  }
}
