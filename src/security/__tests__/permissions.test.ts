import { describe, expect, it } from "vitest";
import {
  createDefaultPermissionPolicy,
  evaluateToolPermission,
  isRiskAtLeast,
  type PermissionPolicy,
} from "../permissions.js";
import type { ToolDefinition } from "../../tools/types.js";

function createTool(
  overrides: Partial<ToolDefinition> = {},
): ToolDefinition {
  return {
    name: "test.read",
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

describe("permissions", () => {
  it("compara niveles de riesgo", () => {
    expect(isRiskAtLeast("safe", "low")).toBe(false);
    expect(isRiskAtLeast("medium", "low")).toBe(true);
    expect(isRiskAtLeast("critical", "high")).toBe(true);
  });

  it("deny mode bloquea cualquier tool", () => {
    const policy = createDefaultPermissionPolicy("deny");
    const tool = createTool();

    const result = evaluateToolPermission({ policy, tool });

    expect(result.effect).toBe("deny");
    expect(result.reason).toBe("Permission mode is deny.");
  });

  it("allow mode permite una tool si no hay regla deny", () => {
    const policy = createDefaultPermissionPolicy("allow");
    const tool = createTool({
      name: "shell.execute",
      risk: "high",
      permissions: [ "shell:execute" ],
      requiresConfirmation: true,
      isReadOnly: false,
    });

    const result = evaluateToolPermission({ policy, tool });

    expect(result.effect).toBe("allow");
  });

  it("ask mode permite tools read-only de bajo riesgo", () => {
    const policy = createDefaultPermissionPolicy("ask");
    const tool = createTool({
      risk: "low",
      isReadOnly: true,
      requiresConfirmation: false,
    });

    const result = evaluateToolPermission({ policy, tool });

    expect(result.effect).toBe("allow");
  });

  it("ask mode pide confirmación para tools que modifican estado", () => {
    const policy = createDefaultPermissionPolicy("ask");
    const tool = createTool({
      name: "filesystem.write",
      risk: "high",
      permissions: [ "filesystem:write" ],
      requiresConfirmation: true,
      isReadOnly: false,
    });

    const result = evaluateToolPermission({ policy, tool });

    expect(result.effect).toBe("ask");
  });

  it("una regla deny por permiso gana sobre allow mode", () => {
    const policy: PermissionPolicy = {
      mode: "allow",
      rules: [
        {
          effect: "deny",
          permission: "shell:execute",
          reason: "Shell bloqueado.",
        },
      ],
    };

    const tool = createTool({
      name: "shell.execute",
      permissions: [ "shell:execute" ],
      risk: "high",
      isReadOnly: false,
    });

    const result = evaluateToolPermission({ policy, tool });

    expect(result.effect).toBe("deny");
    expect(result.reason).toBe("Shell bloqueado.");
  });

  it("una regla ask por riesgo aplica a tools medium o superior", () => {
    const policy: PermissionPolicy = {
      mode: "allow",
      rules: [
        {
          effect: "ask",
          minRisk: "medium",
        },
      ],
    };

    const tool = createTool({
      risk: "medium",
    });

    const result = evaluateToolPermission({ policy, tool });

    expect(result.effect).toBe("ask");
  });
});