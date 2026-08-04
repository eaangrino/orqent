import type { AnyToolDefinition, ToolContext, ToolResult } from "../tools/types.js";
import { toolError } from "../tools/types.js";

export async function authorizeTool(
  tool: AnyToolDefinition,
  args: unknown,
  context: ToolContext,
): Promise<ToolResult | null> {
  if (context.permissionMode === "read-only" && tool.risk !== "read") {
    return toolError(
      "permission_denied",
      `La tool ${tool.name} está bloqueada en modo read-only.`,
    );
  }

  if (context.permissionMode === "auto" || tool.risk === "read") {
    return null;
  }

  const allowed = await context.confirm({
    name: tool.name,
    description: tool.description,
    risk: tool.risk,
    arguments: args,
  });

  return allowed
    ? null
    : toolError("confirmation_denied", `Ejecución denegada: ${tool.name}`);
}
