import { describe, expect, it, vi } from "vitest";
import { createToolRegistry, executeTool } from "../index.js";
import {
  createNodeVersionTool,
  createNpmScriptsTool,
  createNpmVersionTool,
  createNvmCurrentTool,
  createNvmListTool,
  createNpmInstallTool,
  createNpmRunTool,
  createNpmUninstallTool,
  createNvmInstallTool,
  createNvmUseTool,
  type NodeRuntimeMutationResult,
  type NodeRuntimeCliCommandRunner,
  type NodeRuntimeCommandResult,
  type NodeVersionResult,
  type NpmScriptsResult,
} from "../builtin/node-runtime.js";
import { defaultToolRegistry } from "../registry.js";

function createCliResult(
  overrides: Partial<Awaited<ReturnType<NodeRuntimeCliCommandRunner>>> = {},
) {
  return {
    command: "node",
    args: [ "--version" ],
    cwd: "/tmp/project",
    exitCode: 0,
    signal: null,
    stdout: "",
    stderr: "",
    durationMs: 12,
    timedOut: false,
    truncated: false,
    ...overrides,
  };
}

describe("node runtime tools", () => {
  it("registra node/npm/nvm read-only tools en el registry por defecto", () => {
    expect(defaultToolRegistry.has("node.version")).toBe(true);
    expect(defaultToolRegistry.has("npm.version")).toBe(true);
    expect(defaultToolRegistry.has("npm.scripts")).toBe(true);
    expect(defaultToolRegistry.has("nvm.current")).toBe(true);
    expect(defaultToolRegistry.has("nvm.list")).toBe(true);
  });

  it("node.version ejecuta node --version mediante el adapter CLI controlado", async () => {
    const runCommand = vi.fn<NodeRuntimeCliCommandRunner>().mockResolvedValue(
      createCliResult({
        command: "node",
        args: [ "--version" ],
        stdout: "v22.11.0\n",
      }),
    );

    const registry = createToolRegistry([ createNodeVersionTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "node.version",
      input: {},
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const payload = result.result as NodeVersionResult;

    expect(payload.version).toBe("v22.11.0");
    expect(payload.command).toEqual({
      command: "node",
      args: [ "--version" ],
    });
    expect(result.metadata).toMatchObject({
      adapter: "cli",
      command: "node",
      exitCode: 0,
    });
  });

  it("npm.version ejecuta npm --version mediante el adapter CLI controlado", async () => {
    const runCommand = vi.fn<NodeRuntimeCliCommandRunner>().mockResolvedValue(
      createCliResult({
        command: "npm",
        args: [ "--version" ],
        stdout: "11.6.2\n",
      }),
    );

    const registry = createToolRegistry([ createNpmVersionTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "npm.version",
      input: {},
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const payload = result.result as NodeVersionResult;

    expect(payload.version).toBe("11.6.2");
    expect(payload.command).toEqual({
      command: "npm",
      args: [ "--version" ],
    });
  });

  it("npm.scripts lee scripts de package.json vía npm pkg get scripts --json", async () => {
    const runCommand = vi.fn<NodeRuntimeCliCommandRunner>().mockResolvedValue(
      createCliResult({
        command: "npm",
        args: [ "pkg", "get", "scripts", "--json" ],
        stdout: JSON.stringify({
          typecheck: "tsc --noEmit",
          "test:run": "vitest run",
        }),
      }),
    );

    const registry = createToolRegistry([ createNpmScriptsTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "npm.scripts",
      input: {},
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const payload = result.result as NpmScriptsResult;

    expect(payload.count).toBe(2);
    expect(payload.scripts).toEqual({
      typecheck: "tsc --noEmit",
      "test:run": "vitest run",
    });
    expect(payload.command).toEqual({
      command: "npm",
      args: [ "pkg", "get", "scripts", "--json" ],
    });
  });

  it("nvm.current usa bash con bootstrap fijo de nvm", async () => {
    const runCommand = vi.fn<NodeRuntimeCliCommandRunner>().mockResolvedValue(
      createCliResult({
        command: "bash",
        args: [
          "-lc",
          'export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; nvm current',
        ],
        stdout: "v22.11.0\n",
      }),
    );

    const registry = createToolRegistry([ createNvmCurrentTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "nvm.current",
      input: {},
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const payload = result.result as NodeVersionResult;

    expect(payload.version).toBe("v22.11.0");
    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "bash",
        args: expect.arrayContaining([ "-lc" ]),
        cwd: "/tmp/project",
      }),
    );
  });

  it("nvm.list usa bash con bootstrap fijo de nvm", async () => {
    const runCommand = vi.fn<NodeRuntimeCliCommandRunner>().mockResolvedValue(
      createCliResult({
        command: "bash",
        args: [
          "-lc",
          'export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; nvm ls',
        ],
        stdout: "->     v22.11.0\n        v20.18.1\n",
      }),
    );

    const registry = createToolRegistry([ createNvmListTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "nvm.list",
      input: {},
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const payload = result.result as NodeRuntimeCommandResult;

    expect(payload.stdout).toContain("v22.11.0");
    expect(payload.command.command).toBe("bash");
  });

  it("rechaza input con propiedades extra", async () => {
    const registry = createToolRegistry([ createNodeVersionTool() ]);

    const result = await executeTool({
      registry,
      toolName: "node.version",
      input: {
        command: "node -e",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected invalid input.");
    }

    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe("input does not accept properties.");
  });

  it("devuelve error controlado cuando el comando falla", async () => {
    const runCommand = vi.fn<NodeRuntimeCliCommandRunner>().mockResolvedValue(
      createCliResult({
        command: "npm",
        args: [ "--version" ],
        exitCode: 127,
        stderr: "npm: command not found",
      }),
    );

    const registry = createToolRegistry([ createNpmVersionTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "npm.version",
      input: {},
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected command failure.");
    }

    expect(result.error.code).toBe("node_runtime_command_failed");
    expect(result.error.message).toBe(
      "npm.version failed with exit code 127.",
    );
    expect(result.metadata).toMatchObject({
      adapter: "cli",
      command: "npm",
      exitCode: 127,
    });
  });

  it("registra node/npm/nvm mutating tools en el registry por defecto", () => {
    expect(defaultToolRegistry.has("npm.run")).toBe(true);
    expect(defaultToolRegistry.has("npm.install")).toBe(true);
    expect(defaultToolRegistry.has("npm.uninstall")).toBe(true);
    expect(defaultToolRegistry.has("nvm.use")).toBe(true);
    expect(defaultToolRegistry.has("nvm.install")).toBe(true);
  });

  it("npm.run requiere confirmación y ejecuta npm run script -- args", async () => {
    const runCommand = vi.fn<NodeRuntimeCliCommandRunner>().mockResolvedValue(
      createCliResult({
        command: "npm",
        args: [ "run", "typecheck", "--", "--watch" ],
        stdout: "ok\n",
      }),
    );

    const registry = createToolRegistry([ createNpmRunTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "npm.run",
      input: {
        script: "typecheck",
        args: [ "--watch" ],
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const payload = result.result as NodeRuntimeMutationResult;

    expect(payload.operation).toBe("npm_run");
    expect(payload.command).toEqual({
      command: "npm",
      args: [ "run", "typecheck", "--", "--watch" ],
    });
  });

  it("npm.install requiere confirmación y soporta dev dependencies", async () => {
    const runCommand = vi.fn<NodeRuntimeCliCommandRunner>().mockResolvedValue(
      createCliResult({
        command: "npm",
        args: [ "install", "--save-dev", "vitest" ],
        stdout: "installed\n",
      }),
    );

    const registry = createToolRegistry([ createNpmInstallTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "npm.install",
      input: {
        packages: [ "vitest" ],
        dev: true,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const payload = result.result as NodeRuntimeMutationResult;

    expect(payload.operation).toBe("npm_install");
    expect(payload.command.args).toEqual([ "install", "--save-dev", "vitest" ]);
  });

  it("npm.uninstall requiere confirmación y ejecuta npm uninstall packages", async () => {
    const runCommand = vi.fn<NodeRuntimeCliCommandRunner>().mockResolvedValue(
      createCliResult({
        command: "npm",
        args: [ "uninstall", "left-pad" ],
        stdout: "removed\n",
      }),
    );

    const registry = createToolRegistry([ createNpmUninstallTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "npm.uninstall",
      input: {
        packages: [ "left-pad" ],
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const payload = result.result as NodeRuntimeMutationResult;

    expect(payload.operation).toBe("npm_uninstall");
    expect(payload.command.args).toEqual([ "uninstall", "left-pad" ]);
  });

  it("nvm.use pasa la versión como argumento posicional seguro", async () => {
    const runCommand = vi.fn<NodeRuntimeCliCommandRunner>().mockResolvedValue(
      createCliResult({
        command: "bash",
        args: [
          "-lc",
          'export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; nvm use "$1"',
          "orqent-nvm-use",
          "22",
        ],
        stdout: "Now using node v22\n",
      }),
    );

    const registry = createToolRegistry([ createNvmUseTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "nvm.use",
      input: {
        version: "22",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const payload = result.result as NodeRuntimeMutationResult;

    expect(payload.operation).toBe("nvm_use");
    expect(payload.command.args).toContain("22");
  });

  it("nvm.install pasa la versión como argumento posicional seguro", async () => {
    const runCommand = vi.fn<NodeRuntimeCliCommandRunner>().mockResolvedValue(
      createCliResult({
        command: "bash",
        args: [
          "-lc",
          'export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; nvm install "$1"',
          "orqent-nvm-install",
          "lts/*",
        ],
        stdout: "installed\n",
      }),
    );

    const registry = createToolRegistry([ createNvmInstallTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "nvm.install",
      input: {
        version: "lts/*",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const payload = result.result as NodeRuntimeMutationResult;

    expect(payload.operation).toBe("nvm_install");
    expect(payload.command.args).toContain("lts/*");
  });

  it("npm.install rechaza package specs que empiezan por guion", async () => {
    const registry = createToolRegistry([ createNpmInstallTool() ]);

    const result = await executeTool({
      registry,
      toolName: "npm.install",
      input: {
        packages: [ "--unsafe-option" ],
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected invalid input.");
    }

    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe("package specs must not start with '-'.");
  });

  it("npm.run queda bloqueado si no hay confirmación", async () => {
    const registry = createToolRegistry([ createNpmRunTool() ]);

    const result = await executeTool({
      registry,
      toolName: "npm.run",
      input: {
        script: "typecheck",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected confirmation failure.");
    }

    expect(result.error.code).toBe("tool_confirmation_required");
  });
});