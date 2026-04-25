import { describe, expect, it } from "vitest";
import { buildPermissionPolicy, evaluateToolPermission } from "../index.js";
import type { ToolDefinition } from "../../tools/types.js";

function createTool(
  overrides: Partial<ToolDefinition> = {},
): ToolDefinition {
  return {
    name: "test.tool",
    description: "Test tool.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
    },
    risk: "low",
    permissions: [],
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

function createRuntimePolicy(mode: "ask" | "allow" | "deny") {
  return buildPermissionPolicy({
    mode,
    denyRiskAtLeast: "critical",
  });
}

describe("runtime permission policy defaults", () => {
  it("ask permite read-only de bajo riesgo", () => {
    const result = evaluateToolPermission({
      policy: createRuntimePolicy("ask"),
      tool: createTool({
        risk: "low",
        isReadOnly: true,
      }),
    });

    expect(result.effect).toBe("allow");
  });

  it("ask pide confirmación para shell.execute", () => {
    const result = evaluateToolPermission({
      policy: createRuntimePolicy("ask"),
      tool: createTool({
        name: "shell.execute",
        risk: "high",
        permissions: [ "shell:execute" ],
        requiresConfirmation: true,
        isReadOnly: false,
      }),
    });

    expect(result.effect).toBe("ask");
  });

  it("allow permite shell.execute si no es critical", () => {
    const result = evaluateToolPermission({
      policy: createRuntimePolicy("allow"),
      tool: createTool({
        name: "shell.execute",
        risk: "high",
        permissions: [ "shell:execute" ],
        requiresConfirmation: true,
        isReadOnly: false,
      }),
    });

    expect(result.effect).toBe("allow");
  });

  it("deny bloquea todo", () => {
    const result = evaluateToolPermission({
      policy: createRuntimePolicy("deny"),
      tool: createTool(),
    });

    expect(result.effect).toBe("deny");
  });

  it("critical queda bloqueado incluso en allow", () => {
    const result = evaluateToolPermission({
      policy: createRuntimePolicy("allow"),
      tool: createTool({
        name: "critical.tool",
        risk: "critical",
        permissions: [ "shell:execute" ],
        isReadOnly: false,
      }),
    });

    expect(result.effect).toBe("deny");
  });
});