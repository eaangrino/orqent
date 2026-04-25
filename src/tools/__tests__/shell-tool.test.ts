import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDefaultPermissionPolicy } from "../../security/index.js";
import { createToolRegistry } from "../registry.js";
import { executeTool } from "../router.js";
import type { ToolExecutionResult } from "../types.js";
import {
  getShellExecutionProfile,
  shellExecuteTool,
  type ShellExecuteResult,
} from "../builtin/shell.js";

let tempDir = "";

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "orqent-shell-test-"));
});

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, {
      recursive: true,
      force: true,
    });
    tempDir = "";
  }
});

function expectOkResult<TResult>(
  result: ToolExecutionResult,
): asserts result is {
  ok: true;
  result: TResult;
  metadata?: Record<string, unknown>;
} {
  expect(result.ok).toBe(true);
}

function expectErrorResult(
  result: ToolExecutionResult,
): asserts result is {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: Record<string, unknown>;
} {
  expect(result.ok).toBe(false);
}

describe("shell.execute", () => {
  it("bloquea rm contra targets peligrosos", async () => {
    const registry = createToolRegistry([ shellExecuteTool ]);

    const result = await executeTool({
      registry,
      toolName: "shell.execute",
      input: {
        command: "rm",
        args: [ "-rf", "." ],
      },
      sessionId: "session-test",
      cwd: tempDir,
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expectErrorResult(result);
    expect(result.error.code).toBe("shell_removal_dangerous_target");
    expect(result.error.message).toBe('Refusing to remove dangerous target ".".');
  });

  it("clasifica rm como mutable y alto riesgo", () => {
    const profile = getShellExecutionProfile({
      command: "rm",
      args: [ "old-file.txt" ],
    });

    expect(profile).toEqual({
      risk: "high",
      permissions: [ "shell:execute" ],
      requiresConfirmation: true,
      isReadOnly: false,
    });
  });

  it("ejecuta rm dentro del cwd con confirmación", async () => {
    const targetFile = join(tempDir, "old-file.txt");

    await writeFile(targetFile, "legacy", "utf8");

    const registry = createToolRegistry([ shellExecuteTool ]);

    const result = await executeTool({
      registry,
      toolName: "shell.execute",
      input: {
        command: "rm",
        args: [ "old-file.txt" ],
      },
      sessionId: "session-test",
      cwd: tempDir,
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expectOkResult<ShellExecuteResult>(result);
    expect(result.result.exitCode).toBe(0);

    await expect(readFile(targetFile, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("bloquea rm fuera del cwd", async () => {
    const outsideDir = await mkdtemp(join(tmpdir(), "orqent-shell-outside-"));
    const outsideFile = join(outsideDir, "outside.txt");

    await writeFile(outsideFile, "outside", "utf8");

    const registry = createToolRegistry([ shellExecuteTool ]);

    const result = await executeTool({
      registry,
      toolName: "shell.execute",
      input: {
        command: "rm",
        args: [ outsideFile ],
      },
      sessionId: "session-test",
      cwd: tempDir,
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expectErrorResult(result);
    expect(result.error.code).toBe("shell_removal_outside_cwd");

    await expect(readFile(outsideFile, "utf8")).resolves.toBe("outside");

    await rm(outsideDir, {
      recursive: true,
      force: true,
    });
  });

  it("bloquea rmdir fuera del cwd", async () => {
    const outsideDir = await mkdtemp(join(tmpdir(), "orqent-shell-outside-"));

    const registry = createToolRegistry([ shellExecuteTool ]);

    const result = await executeTool({
      registry,
      toolName: "shell.execute",
      input: {
        command: "rmdir",
        args: [ outsideDir ],
      },
      sessionId: "session-test",
      cwd: tempDir,
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expectErrorResult(result);
    expect(result.error.code).toBe("shell_removal_outside_cwd");

    await rm(outsideDir, {
      recursive: true,
      force: true,
    });
  });

  it("no bloquea systemctl status en validación dura", async () => {
    const registry = createToolRegistry([ shellExecuteTool ]);

    const result = await executeTool({
      registry,
      toolName: "shell.execute",
      input: {
        command: "systemctl",
        args: [ "status", "nginx" ],
      },
      sessionId: "session-test",
      cwd: process.cwd(),
      permissionPolicy: createDefaultPermissionPolicy("deny"),
    });

    expectErrorResult(result);
    expect(result.error.code).toBe("tool_permission_denied");
  });

  it("clasifica systemctl status como read-only y bajo riesgo", () => {
    const profile = getShellExecutionProfile({
      command: "systemctl",
      args: [ "status", "nginx" ],
    });

    expect(profile).toEqual({
      risk: "low",
      permissions: [ "shell:execute" ],
      requiresConfirmation: false,
      isReadOnly: true,
    });
  });

  it("clasifica systemctl restart como mutable y alto riesgo", () => {
    const profile = getShellExecutionProfile({
      command: "systemctl",
      args: [ "restart", "nginx" ],
    });

    expect(profile).toEqual({
      risk: "high",
      permissions: [ "shell:execute" ],
      requiresConfirmation: true,
      isReadOnly: false,
    });
  });

  it("clasifica systemctl reboot como crítico", () => {
    const profile = getShellExecutionProfile({
      command: "systemctl",
      args: [ "reboot" ],
    });

    expect(profile).toEqual({
      risk: "critical",
      permissions: [ "shell:execute" ],
      requiresConfirmation: true,
      isReadOnly: false,
    });
  });

  it("bloquea intérpretes con ejecución inline", async () => {
    const registry = createToolRegistry([ shellExecuteTool ]);

    const result = await executeTool({
      registry,
      toolName: "shell.execute",
      input: {
        command: "bash",
        args: [ "-c", "echo unsafe" ],
      },
      sessionId: "session-test",
      cwd: process.cwd(),
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expectErrorResult(result);
    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe(
      'Shell interpreter "bash" with command execution flag is blocked by the safety policy.',
    );
  });

  it("ejecuta un comando permitido con confirmación", async () => {
    const registry = createToolRegistry([ shellExecuteTool ]);

    const result = await executeTool({
      registry,
      toolName: "shell.execute",
      input: {
        command: "echo",
        args: [ "hola-orqent" ],
      },
      sessionId: "session-test",
      cwd: process.cwd(),
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expectOkResult<ShellExecuteResult>(result);
    expect(result.result.exitCode).toBe(0);
    expect(result.result.stdout).toContain("hola-orqent");
  });
});