import { describe, expect, it, vi } from "vitest";
import { createDefaultPermissionPolicy } from "../../security/index.js";
import { createToolRegistry } from "../registry.js";
import { executeTool } from "../router.js";
import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from "../types.js";

type EchoInput = {
  value: string;
};

type EchoResult = {
  value: string;
  cwd: string;
  sessionId: string;
};

function createEchoTool(
  overrides: Partial<ToolDefinition<EchoInput, EchoResult>> = {},
): ToolDefinition<EchoInput, EchoResult> {
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
      required: [ "value" ],
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
    async execute(input, context) {
      return {
        ok: true,
        result: {
          value: input.value,
          cwd: context.cwd,
          sessionId: context.sessionId,
        },
      };
    },
    ...overrides,
  };
}

function expectEchoResult(
  result: ToolExecutionResult,
): asserts result is {
  ok: true;
  result: EchoResult;
  metadata?: Record<string, unknown>;
} {
  expect(result.ok).toBe(true);
}

describe("executeTool", () => {
  it("devuelve tool_not_found cuando la tool no existe", async () => {
    const registry = createToolRegistry();

    const result = await executeTool({
      registry,
      toolName: "missing.tool",
      input: {},
      sessionId: "session-test",
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe("tool_not_found");
    }
  });

  it("valida input antes de ejecutar la tool", async () => {
    const execute = vi.fn<(
      input: EchoInput,
      context: ToolExecutionContext,
    ) => Promise<ToolExecutionResult<EchoResult>>>();

    const registry = createToolRegistry([
      createEchoTool({
        execute,
      }),
    ]);

    const result = await executeTool({
      registry,
      toolName: "test.echo",
      input: {
        value: 123,
      },
      sessionId: "session-test",
    });

    expect(result.ok).toBe(false);
    expect(execute).not.toHaveBeenCalled();

    if (!result.ok) {
      expect(result.error.code).toBe("invalid_tool_input");
      expect(result.error.message).toBe("value must be a string.");
    }
  });

  it("ejecuta una tool válida y añade metadata de intentos", async () => {
    const registry = createToolRegistry([ createEchoTool() ]);

    const result = await executeTool({
      registry,
      toolName: "test.echo",
      input: {
        value: "hola",
      },
      sessionId: "session-test",
      cwd: process.cwd(),
    });

    expectEchoResult(result);
    expect(result.metadata).toEqual({
      attempts: 1,
      maxAttempts: 1,
    });

    if (result.ok) {
      expect(result.result.value).toBe("hola");
      expect(result.result.sessionId).toBe("session-test");
      expect(result.result.cwd).toBe(process.cwd());
    }
  });

  it("bloquea tools peligrosas cuando no hay confirmación", async () => {
    const execute = vi.fn<(
      input: EchoInput,
      context: ToolExecutionContext,
    ) => Promise<ToolExecutionResult<EchoResult>>>();

    const registry = createToolRegistry([
      createEchoTool({
        risk: "high",
        requiresConfirmation: true,
        isReadOnly: false,
        permissions: [ "shell:execute" ],
        execute,
      }),
    ]);

    const result = await executeTool({
      registry,
      toolName: "test.echo",
      input: {
        value: "no ejecutar",
      },
      sessionId: "session-test",
    });

    expect(result.ok).toBe(false);
    expect(execute).not.toHaveBeenCalled();

    if (!result.ok) {
      expect(result.error.code).toBe("tool_confirmation_required");
    }
  });

  it("ejecuta tools peligrosas cuando la confirmación permite", async () => {
    const confirmToolExecution = vi.fn().mockResolvedValue({
      allowed: true,
    });

    const registry = createToolRegistry([
      createEchoTool({
        risk: "high",
        requiresConfirmation: true,
        isReadOnly: false,
        permissions: [ "shell:execute" ],
      }),
    ]);

    const result = await executeTool({
      registry,
      toolName: "test.echo",
      input: {
        value: "ejecutar",
      },
      sessionId: "session-test",
      confirmToolExecution,
    });

    expect(confirmToolExecution).toHaveBeenCalledTimes(1);
    expectEchoResult(result);

    if (result.ok) {
      expect(result.result.value).toBe("ejecutar");
    }
  });

  it("no ejecuta tools peligrosas cuando la confirmación deniega", async () => {
    const execute = vi.fn<(
      input: EchoInput,
      context: ToolExecutionContext,
    ) => Promise<ToolExecutionResult<EchoResult>>>();

    const confirmToolExecution = vi.fn().mockResolvedValue({
      allowed: false,
      reason: "rechazado en test",
    });

    const registry = createToolRegistry([
      createEchoTool({
        risk: "high",
        requiresConfirmation: true,
        isReadOnly: false,
        permissions: [ "shell:execute" ],
        execute,
      }),
    ]);

    const result = await executeTool({
      registry,
      toolName: "test.echo",
      input: {
        value: "no ejecutar",
      },
      sessionId: "session-test",
      confirmToolExecution,
    });

    expect(execute).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe("tool_confirmation_denied");
      expect(result.error.message).toBe("rechazado en test");
    }
  });

  it("reintenta errores marcados como retryables", async () => {
    let attempts = 0;

    const registry = createToolRegistry([
      createEchoTool({
        retry: {
          maxAttempts: 2,
          delayMs: 0,
          retryableErrorCodes: [ "temporary_failure" ],
        },
        async execute(input) {
          attempts++;

          if (attempts === 1) {
            return {
              ok: false,
              error: {
                code: "temporary_failure",
                message: "fallo temporal",
              },
            };
          }

          return {
            ok: true,
            result: {
              value: input.value,
              cwd: "cwd-test",
              sessionId: "session-test",
            },
          };
        },
      }),
    ]);

    const result = await executeTool({
      registry,
      toolName: "test.echo",
      input: {
        value: "después del retry",
      },
      sessionId: "session-test",
    });

    expect(attempts).toBe(2);
    expectEchoResult(result);
    expect(result.metadata).toEqual({
      attempts: 2,
      maxAttempts: 2,
    });

    if (result.ok) {
      expect(result.result.value).toBe("después del retry");
    }
  });

  it("bloquea una tool cuando permissionPolicy está en deny", async () => {
    const execute = vi.fn<(
      input: EchoInput,
      context: ToolExecutionContext,
    ) => Promise<ToolExecutionResult<EchoResult>>>();

    const registry = createToolRegistry([
      createEchoTool({
        execute,
      }),
    ]);

    const result = await executeTool({
      registry,
      toolName: "test.echo",
      input: {
        value: "no ejecutar",
      },
      sessionId: "session-test",
      permissionPolicy: createDefaultPermissionPolicy("deny"),
    });

    expect(execute).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.code).toBe("tool_permission_denied");
      expect(result.error.message).toBe("Permission mode is deny.");
    }
  });

  it("allow mode permite una tool peligrosa sin confirmación", async () => {
    const execute = vi.fn(async (
      input: EchoInput,
      context: ToolExecutionContext,
    ): Promise<ToolExecutionResult<EchoResult>> => ({
      ok: true,
      result: {
        value: input.value,
        cwd: context.cwd,
        sessionId: context.sessionId,
      },
    }));

    const registry = createToolRegistry([
      createEchoTool({
        risk: "high",
        requiresConfirmation: true,
        isReadOnly: false,
        permissions: [ "shell:execute" ],
        execute,
      }),
    ]);

    const result = await executeTool({
      registry,
      toolName: "test.echo",
      input: {
        value: "ejecutar",
      },
      sessionId: "session-test",
      permissionPolicy: createDefaultPermissionPolicy("allow"),
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expectEchoResult(result);

    if (result.ok) {
      expect(result.result.value).toBe("ejecutar");
    }
  });

  it("registra auditoría cuando una tool se ejecuta correctamente", async () => {
    const toolActionLogger = vi.fn();
    const registry = createToolRegistry([ createEchoTool() ]);

    const result = await executeTool({
      registry,
      toolName: "test.echo",
      input: {
        value: "audit-ok",
      },
      sessionId: "session-test",
      cwd: process.cwd(),
      toolActionLogger,
    });

    expectEchoResult(result);
    expect(toolActionLogger).toHaveBeenCalledTimes(1);
    expect(toolActionLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-test",
        toolName: "test.echo",
        cwd: process.cwd(),
        input: {
          value: "audit-ok",
        },
        status: "executed",
        ok: true,
        risk: "safe",
        permissions: [],
        requiresConfirmation: false,
        isReadOnly: true,
        permissionEffect: "allow",
        confirmation: "not_required",
      }),
    );
  });

  it("registra auditoría cuando una tool queda bloqueada por permisos", async () => {
    const toolActionLogger = vi.fn();
    const execute = vi.fn<(
      input: EchoInput,
      context: ToolExecutionContext,
    ) => Promise<ToolExecutionResult<EchoResult>>>();

    const registry = createToolRegistry([
      createEchoTool({
        execute,
      }),
    ]);

    const result = await executeTool({
      registry,
      toolName: "test.echo",
      input: {
        value: "audit-denied",
      },
      sessionId: "session-test",
      permissionPolicy: createDefaultPermissionPolicy("deny"),
      toolActionLogger,
    });

    expect(result.ok).toBe(false);
    expect(execute).not.toHaveBeenCalled();
    expect(toolActionLogger).toHaveBeenCalledTimes(1);
    expect(toolActionLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-test",
        toolName: "test.echo",
        input: {
          value: "audit-denied",
        },
        status: "permission_denied",
        ok: false,
        permissionEffect: "deny",
        permissionReason: "Permission mode is deny.",
        confirmation: "not_required",
        errorCode: "tool_permission_denied",
      }),
    );
  });

  it("redacta contenido sensible en auditoría", async () => {
    const toolActionLogger = vi.fn();

    const registry = createToolRegistry([
      createEchoTool({
        validateInput(input) {
          return {
            ok: true,
            input: input as EchoInput,
          };
        },
      }),
    ]);

    await executeTool({
      registry,
      toolName: "test.echo",
      input: {
        value: "audit-redacted",
        content: "secret-content",
        stdin: "secret-stdin",
        headers: {
          Authorization: "Bearer should-not-leak",
          Accept: "application/json",
          "x-database-uri": "postgresql://postgres:admin@localhost:5432/db",
        },
        env: {
          NODE_ENV: "test",
          SECRET_TOKEN: "should-not-leak",
          DATABASE_URL: "postgresql://postgres:admin@localhost:5432/db",
        },
      },
      sessionId: "session-test",
      toolActionLogger,
    });

    expect(toolActionLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          value: "audit-redacted",
          content: "[redacted 14 bytes]",
          stdin: "[redacted 12 bytes]",
          headers: {
            Authorization: "[redacted secret]",
            Accept: "application/json",
            "x-database-uri": "[redacted secret]",
          },
          env: {
            NODE_ENV: "test",
            SECRET_TOKEN: "[redacted secret]",
            DATABASE_URL: "[redacted secret]",
          },
        }),
      }),
    );

    const loggedInput = toolActionLogger.mock.calls[ 0 ]?.[ 0 ].input;

    expect(JSON.stringify(loggedInput)).not.toContain("should-not-leak");
    expect(JSON.stringify(loggedInput)).not.toContain("postgres:admin");
  });
});
