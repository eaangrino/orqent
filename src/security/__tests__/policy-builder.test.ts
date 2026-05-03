import { describe, expect, it } from "vitest";
import { buildPermissionPolicy, evaluateToolPermission } from "../index.js";
import type { ToolDefinition } from "../../tools/types.js";

function createTool(
  overrides: Partial<ToolDefinition> = {},
): ToolDefinition {
  return {
    name: "filesystem.read",
    description: "Test tool.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
    },
    risk: "low",
    permissions: [ "filesystem:read" ],
    requiresConfirmation: false,
    isReadOnly: true,
    async execute() {
      return {
        ok: true,
        result: {},
      };
    },
    ...overrides,
  };
}

describe("buildPermissionPolicy", () => {
  it("bloquea tools por nombre", () => {
    const policy = buildPermissionPolicy({
      mode: "allow",
      blockedTools: [ "shell.execute" ],
    });

    const result = evaluateToolPermission({
      policy,
      tool: createTool({
        name: "shell.execute",
        permissions: [ "shell:execute" ],
        risk: "high",
        isReadOnly: false,
      }),
    });

    expect(result.effect).toBe("deny");
    expect(result.reason).toBe('Tool "shell.execute" is blocked by policy.');
  });

  it("bloquea tools por permiso", () => {
    const policy = buildPermissionPolicy({
      mode: "allow",
      blockedPermissions: [ "filesystem:write" ],
    });

    const result = evaluateToolPermission({
      policy,
      tool: createTool({
        name: "filesystem.write",
        permissions: [ "filesystem:write" ],
        risk: "high",
        isReadOnly: false,
      }),
    });

    expect(result.effect).toBe("deny");
    expect(result.reason).toBe(
      'Permission "filesystem:write" is blocked by policy.',
    );
  });

  it("fuerza confirmación por permiso", () => {
    const policy = buildPermissionPolicy({
      mode: "allow",
      askPermissions: [ "shell:execute" ],
    });

    const result = evaluateToolPermission({
      policy,
      tool: createTool({
        name: "shell.execute",
        permissions: [ "shell:execute" ],
        risk: "high",
        isReadOnly: false,
      }),
    });

    expect(result.effect).toBe("ask");
    expect(result.reason).toBe(
      'Permission "shell:execute" requires confirmation by policy.',
    );
  });

  it("bloquea por riesgo mínimo", () => {
    const policy = buildPermissionPolicy({
      mode: "allow",
      denyRiskAtLeast: "critical",
    });

    const result = evaluateToolPermission({
      policy,
      tool: createTool({
        name: "dangerous.tool",
        risk: "critical",
        permissions: [ "shell:execute" ],
        isReadOnly: false,
      }),
    });

    expect(result.effect).toBe("deny");
  });

  it("fuerza confirmación por riesgo mínimo", () => {
    const policy = buildPermissionPolicy({
      mode: "allow",
      askRiskAtLeast: "medium",
    });

    const result = evaluateToolPermission({
      policy,
      tool: createTool({
        name: "medium.tool",
        risk: "medium",
        permissions: [ "filesystem:read" ],
        isReadOnly: true,
      }),
    });

    expect(result.effect).toBe("ask");
  });

  it("prioriza deny sobre ask", () => {
    const policy = buildPermissionPolicy({
      mode: "allow",
      blockedPermissions: [ "shell:execute" ],
      askRiskAtLeast: "low",
    });

    const result = evaluateToolPermission({
      policy,
      tool: createTool({
        name: "shell.execute",
        permissions: [ "shell:execute" ],
        risk: "low",
        isReadOnly: true,
      }),
    });

    expect(result.effect).toBe("deny");
  });
});