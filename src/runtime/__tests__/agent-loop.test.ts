import { describe, expect, it } from "vitest";
import { createDefaultPermissionPolicy } from "../../security/index.js";
import {
  createToolRegistry,
  type ToolDefinition,
  type ToolExecutionResult,
} from "../../tools/index.js";
import { executeModelToolCall } from "../agent-loop.js";
import { TOOL_CALL_TAG_NAME } from "../tool-call-protocol.js";

type EchoInput = {
  value: string;
};

type EchoResult = {
  value: string;
};

function wrapToolCall(json: string) {
  return `<${TOOL_CALL_TAG_NAME}>
${json}
</${TOOL_CALL_TAG_NAME}>`;
}

function createEchoTool(): ToolDefinition<EchoInput, EchoResult> {
  return {
    name: "test.echo",
    description: "Echo test tool.",
    inputSchema: {
      type: "object",
      properties: {
        value: {
          type: "string",
        },
      },
      required: ["value"],
      additionalProperties: false,
    },
    risk: "safe",
    permissions: [],
    requiresConfirmation: false,
    isReadOnly: true,
    validateInput(input) {
      if (
        typeof input !== "object" ||
        input === null ||
        Array.isArray(input) ||
        typeof (input as Record<string, unknown>).value !== "string"
      ) {
        return {
          ok: false,
          error: "value must be a string.",
        };
      }

      return {
        ok: true,
        input: {
          value: (input as Record<string, string>).value,
        },
      };
    },
    async execute(input) {
      return {
        ok: true,
        result: {
          value: input.value,
        },
      };
    },
  };
}

function expectExecutedResult(
  result: Awaited<ReturnType<typeof executeModelToolCall>>,
): asserts result is {
  kind: "tool_call_executed";
  toolCall: {
    toolName: string;
    input: Record<string, unknown>;
    reason?: string;
  };
  executionResult: ToolExecutionResult;
} {
  expect(result.kind).toBe("tool_call_executed");
}

describe("executeModelToolCall", () => {
  it("devuelve none cuando la respuesta no contiene tool call", async () => {
    const registry = createToolRegistry([createEchoTool()]);

    const result = await executeModelToolCall({
      modelResponse: "Respuesta normal.",
      registry,
      sessionId: "session-test",
    });

    expect(result).toEqual({
      kind: "none",
      parseResult: {
        kind: "none",
      },
    });
  });

  it("devuelve invalid_tool_call cuando el bloque es inválido", async () => {
    const registry = createToolRegistry([createEchoTool()]);

    const result = await executeModelToolCall({
      modelResponse: wrapToolCall(`{
  "toolName": "test.echo",
  "input": []
}`),
      registry,
      sessionId: "session-test",
    });

    expect(result.kind).toBe("invalid_tool_call");

    if (result.kind === "invalid_tool_call") {
      expect(result.parseResult.error).toBe(
        "Tool call input must be a JSON object.",
      );
    }
  });

  it("ejecuta una tool call válida con executeTool", async () => {
    const registry = createToolRegistry([createEchoTool()]);

    const result = await executeModelToolCall({
      modelResponse: wrapToolCall(`{
  "toolName": "test.echo",
  "input": {
    "value": "hola"
  },
  "reason": "Need echo result."
}`),
      registry,
      sessionId: "session-test",
    });

    expectExecutedResult(result);

    expect(result.toolCall).toEqual({
      toolName: "test.echo",
      input: {
        value: "hola",
      },
      reason: "Need echo result.",
    });

    expect(result.executionResult.ok).toBe(true);

    if (result.executionResult.ok) {
      expect(result.executionResult.result).toEqual({
        value: "hola",
      });
      expect(result.executionResult.metadata).toEqual({
        attempts: 1,
        maxAttempts: 1,
      });
    }
  });

  it("devuelve error de executeTool cuando la tool no existe", async () => {
    const registry = createToolRegistry();

    const result = await executeModelToolCall({
      modelResponse: wrapToolCall(`{
  "toolName": "missing.tool",
  "input": {}
}`),
      registry,
      sessionId: "session-test",
    });

    expectExecutedResult(result);

    expect(result.executionResult.ok).toBe(false);

    if (!result.executionResult.ok) {
      expect(result.executionResult.error.code).toBe("tool_not_found");
    }
  });

  it("propaga permissionPolicy hacia executeTool", async () => {
    const registry = createToolRegistry([createEchoTool()]);

    const result = await executeModelToolCall({
      modelResponse: wrapToolCall(`{
  "toolName": "test.echo",
  "input": {
    "value": "bloqueado"
  }
}`),
      registry,
      sessionId: "session-test",
      permissionPolicy: createDefaultPermissionPolicy("deny"),
    });

    expectExecutedResult(result);

    expect(result.executionResult.ok).toBe(false);

    if (!result.executionResult.ok) {
      expect(result.executionResult.error.code).toBe("tool_permission_denied");
      expect(result.executionResult.error.message).toBe("Permission mode is deny.");
    }
  });
});
