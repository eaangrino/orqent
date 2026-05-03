import {
  executeCliCommand,
  type CliCommandAdapterResult,
} from "../../extensibility/adapters/index.js";
import type {
  ToolDefinition,
  ToolExecutionResult,
  ToolValidationResult,
} from "../types.js";

export type NodeRuntimeEmptyInput = Record<string, never>;

export type NodeRuntimeCommandResult = {
  cwd: string;
  command: {
    command: string;
    args: string[];
  };
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  outputTruncated: boolean;
};

export type NodeVersionResult = NodeRuntimeCommandResult & {
  version: string | null;
};

export type NpmScriptsResult = NodeRuntimeCommandResult & {
  scripts: Record<string, string>;
  count: number;
};

export type NodeRuntimeCliCommandRunner = typeof executeCliCommand;

export type NpmRunInput = {
  script: string;
  args: string[];
};

export type NpmPackageMutationInput = {
  packages: string[];
  dev: boolean;
};

export type NvmVersionInput = {
  version: string;
};

export type NodeRuntimeMutationOperation =
  | "npm_run"
  | "npm_install"
  | "npm_uninstall"
  | "nvm_use"
  | "nvm_install";

export type NodeRuntimeMutationResult = NodeRuntimeCommandResult & {
  operation: NodeRuntimeMutationOperation;
};

const NODE_RUNTIME_TIMEOUT_MS = 15_000;
const NODE_RUNTIME_MAX_OUTPUT_CHARS = 40_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateEmptyInput(
  input: unknown,
): ToolValidationResult<NodeRuntimeEmptyInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "input must be an object.",
    };
  }

  if (Object.keys(input).length > 0) {
    return {
      ok: false,
      error: "input does not accept properties.",
    };
  }

  return {
    ok: true,
    input: {},
  };
}

function createCommandFailure<TResult>(
  toolName: string,
  result: CliCommandAdapterResult,
): ToolExecutionResult<TResult> {
  return {
    ok: false,
    error: {
      code: result.timedOut
        ? "node_runtime_command_timeout"
        : "node_runtime_command_failed",
      message: result.timedOut
        ? `${toolName} timed out.`
        : `${toolName} failed with exit code ${result.exitCode ?? "unknown"}.`,
      details: {
        command: result.command,
        args: result.args,
        cwd: result.cwd,
        exitCode: result.exitCode,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr,
        timedOut: result.timedOut,
        truncated: result.truncated,
      },
    },
    metadata: {
      adapter: "cli",
      command: result.command,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      truncated: result.truncated,
    },
  };
}

function createCommandResult(
  result: CliCommandAdapterResult,
): NodeRuntimeCommandResult {
  return {
    cwd: result.cwd,
    command: {
      command: result.command,
      args: result.args,
    },
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    outputTruncated: result.truncated,
  };
}

function parseFirstNonEmptyLine(value: string): string | null {
  return value
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) ?? null;
}

function parseNpmScripts(stdout: string): Record<string, string> {
  const trimmed = stdout.trim();

  if (!trimmed) {
    return {};
  }

  const parsed = JSON.parse(trimmed) as unknown;

  if (!isRecord(parsed)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [ string, string ] =>
        typeof entry[ 0 ] === "string" && typeof entry[ 1 ] === "string",
    ),
  );
}

function normalizeNonEmptyString(value: unknown, fieldName: string): ToolValidationResult<string> {
  if (typeof value !== "string" || !value.trim()) {
    return {
      ok: false,
      error: `${fieldName} must be a non-empty string.`,
    };
  }

  const normalized = value.trim();

  if (/[\u0000-\u001F\u007F]/.test(normalized)) {
    return {
      ok: false,
      error: `${fieldName} must not contain control characters.`,
    };
  }

  return {
    ok: true,
    input: normalized,
  };
}

function normalizeStringArrayInput(value: unknown, fieldName: string): ToolValidationResult<string[]> {
  if (value === undefined) {
    return {
      ok: true,
      input: [],
    };
  }

  if (!Array.isArray(value)) {
    return {
      ok: false,
      error: `${fieldName} must be an array of strings.`,
    };
  }

  const normalized: string[] = [];

  for (const item of value) {
    const result = normalizeNonEmptyString(item, `${fieldName} item`);

    if (!result.ok) {
      return result;
    }

    normalized.push(result.input);
  }

  return {
    ok: true,
    input: normalized,
  };
}

function normalizePackageSpecs(value: unknown): ToolValidationResult<string[]> {
  const result = normalizeStringArrayInput(value, "packages");

  if (!result.ok) {
    return result;
  }

  if (result.input.length === 0) {
    return {
      ok: false,
      error: "packages must include at least one package.",
    };
  }

  for (const packageSpec of result.input) {
    if (/\s/.test(packageSpec)) {
      return {
        ok: false,
        error: "package specs must not contain whitespace.",
      };
    }

    if (packageSpec.startsWith("-")) {
      return {
        ok: false,
        error: "package specs must not start with '-'.",
      };
    }
  }

  return result;
}

function validateNpmRunInput(input: unknown): ToolValidationResult<NpmRunInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "input must be an object.",
    };
  }

  const script = normalizeNonEmptyString(input.script, "script");

  if (!script.ok) {
    return script;
  }

  const args = normalizeStringArrayInput(input.args, "args");

  if (!args.ok) {
    return args;
  }

  return {
    ok: true,
    input: {
      script: script.input,
      args: args.input,
    },
  };
}

function validateNpmPackageMutationInput(
  input: unknown,
): ToolValidationResult<NpmPackageMutationInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "input must be an object.",
    };
  }

  const packages = normalizePackageSpecs(input.packages);

  if (!packages.ok) {
    return packages;
  }

  return {
    ok: true,
    input: {
      packages: packages.input,
      dev: typeof input.dev === "boolean" ? input.dev : false,
    },
  };
}

function validateNvmVersionInput(input: unknown): ToolValidationResult<NvmVersionInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "input must be an object.",
    };
  }

  const version = normalizeNonEmptyString(input.version, "version");

  if (!version.ok) {
    return version;
  }

  if (/\s/.test(version.input)) {
    return {
      ok: false,
      error: "version must not contain whitespace.",
    };
  }

  if (version.input.startsWith("-")) {
    return {
      ok: false,
      error: "version must not start with '-'.",
    };
  }

  return {
    ok: true,
    input: {
      version: version.input,
    },
  };
}

function createMutationFailure<TResult>(
  toolName: string,
  result: CliCommandAdapterResult,
): ToolExecutionResult<TResult> {
  return {
    ok: false,
    error: {
      code: result.timedOut
        ? "node_runtime_mutation_timeout"
        : "node_runtime_mutation_failed",
      message: result.timedOut
        ? `${toolName} timed out.`
        : `${toolName} failed with exit code ${result.exitCode ?? "unknown"}.`,
      details: {
        command: result.command,
        args: result.args,
        cwd: result.cwd,
        exitCode: result.exitCode,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr,
        timedOut: result.timedOut,
        truncated: result.truncated,
      },
    },
    metadata: {
      adapter: "cli",
      command: result.command,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      truncated: result.truncated,
    },
  };
}

function createMutationResult({
  operation,
  result,
}: {
  operation: NodeRuntimeMutationOperation;
  result: CliCommandAdapterResult;
}): NodeRuntimeMutationResult {
  return {
    ...createCommandResult(result),
    operation,
  };
}

function createMutatingCliTool<TInput>({
  name,
  operation,
  description,
  inputSchema,
  validateInput,
  buildCommand,
  runCommand = executeCliCommand,
}: {
  name: string;
  operation: NodeRuntimeMutationOperation;
  description: string;
  inputSchema: ToolDefinition<TInput, NodeRuntimeMutationResult>[ "inputSchema" ];
  validateInput: (input: unknown) => ToolValidationResult<TInput>;
  buildCommand: (input: TInput) => {
    command: string;
    args: string[];
  };
  runCommand?: NodeRuntimeCliCommandRunner;
}): ToolDefinition<TInput, NodeRuntimeMutationResult> {
  return {
    name,
    description,
    inputSchema,
    risk: "high",
    permissions: [ "shell:execute" ],
    requiresConfirmation: true,
    isReadOnly: false,
    timeoutMs: NODE_RUNTIME_TIMEOUT_MS,
    retry: {
      maxAttempts: 1,
      delayMs: 0,
    },
    validateInput,
    async execute(input, context) {
      const command = buildCommand(input);

      const result = await runCommand({
        command: command.command,
        args: command.args,
        cwd: context.cwd,
        timeoutMs: NODE_RUNTIME_TIMEOUT_MS,
        maxOutputChars: NODE_RUNTIME_MAX_OUTPUT_CHARS,
        signal: context.signal,
      });

      if (result.exitCode !== 0) {
        return createMutationFailure<NodeRuntimeMutationResult>(name, result);
      }

      return {
        ok: true,
        result: createMutationResult({
          operation,
          result,
        }),
        metadata: {
          adapter: "cli",
          command: result.command,
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          truncated: result.truncated,
        },
      };
    },
  };
}

function createReadOnlyCliTool<TResult>({
  name,
  description,
  command,
  args,
  mapResult,
  runCommand = executeCliCommand,
}: {
  name: string;
  description: string;
  command: string;
  args: string[];
  mapResult: (result: CliCommandAdapterResult) => TResult;
  runCommand?: NodeRuntimeCliCommandRunner;
}): ToolDefinition<NodeRuntimeEmptyInput, TResult> {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    risk: "safe",
    permissions: [ "shell:execute" ],
    requiresConfirmation: false,
    isReadOnly: true,
    timeoutMs: NODE_RUNTIME_TIMEOUT_MS,
    retry: {
      maxAttempts: 1,
      delayMs: 0,
    },
    validateInput: validateEmptyInput,
    async execute(_input, context) {
      const result = await runCommand({
        command,
        args,
        cwd: context.cwd,
        timeoutMs: NODE_RUNTIME_TIMEOUT_MS,
        maxOutputChars: NODE_RUNTIME_MAX_OUTPUT_CHARS,
        signal: context.signal,
      });

      if (result.exitCode !== 0) {
        return createCommandFailure<TResult>(name, result);
      }

      return {
        ok: true,
        result: mapResult(result),
        metadata: {
          adapter: "cli",
          command: result.command,
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          truncated: result.truncated,
        },
      };
    },
  };
}

export function createNodeVersionTool(
  runCommand: NodeRuntimeCliCommandRunner = executeCliCommand,
): ToolDefinition<NodeRuntimeEmptyInput, NodeVersionResult> {
  return createReadOnlyCliTool({
    name: "node.version",
    description:
      "Read the active Node.js version using node --version through Orqent's controlled CLI adapter.",
    command: "node",
    args: [ "--version" ],
    runCommand,
    mapResult(result) {
      return {
        ...createCommandResult(result),
        version: parseFirstNonEmptyLine(result.stdout),
      };
    },
  });
}

export function createNpmVersionTool(
  runCommand: NodeRuntimeCliCommandRunner = executeCliCommand,
): ToolDefinition<NodeRuntimeEmptyInput, NodeVersionResult> {
  return createReadOnlyCliTool({
    name: "npm.version",
    description:
      "Read the active npm version using npm --version through Orqent's controlled CLI adapter.",
    command: "npm",
    args: [ "--version" ],
    runCommand,
    mapResult(result) {
      return {
        ...createCommandResult(result),
        version: parseFirstNonEmptyLine(result.stdout),
      };
    },
  });
}

export function createNpmScriptsTool(
  runCommand: NodeRuntimeCliCommandRunner = executeCliCommand,
): ToolDefinition<NodeRuntimeEmptyInput, NpmScriptsResult> {
  return createReadOnlyCliTool({
    name: "npm.scripts",
    description:
      "Read package.json scripts using npm pkg get scripts --json through Orqent's controlled CLI adapter.",
    command: "npm",
    args: [ "pkg", "get", "scripts", "--json" ],
    runCommand,
    mapResult(result) {
      const scripts = parseNpmScripts(result.stdout);

      return {
        ...createCommandResult(result),
        scripts,
        count: Object.keys(scripts).length,
      };
    },
  });
}

export function createNvmCurrentTool(
  runCommand: NodeRuntimeCliCommandRunner = executeCliCommand,
): ToolDefinition<NodeRuntimeEmptyInput, NodeVersionResult> {
  return createReadOnlyCliTool({
    name: "nvm.current",
    description:
      "Read the active nvm Node.js version. Uses a fixed bash bootstrap because nvm is usually a shell function, not a standalone binary.",
    command: "bash",
    args: [
      "-lc",
      'export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; nvm current',
    ],
    runCommand,
    mapResult(result) {
      return {
        ...createCommandResult(result),
        version: parseFirstNonEmptyLine(result.stdout),
      };
    },
  });
}

export function createNvmListTool(
  runCommand: NodeRuntimeCliCommandRunner = executeCliCommand,
): ToolDefinition<NodeRuntimeEmptyInput, NodeRuntimeCommandResult> {
  return createReadOnlyCliTool({
    name: "nvm.list",
    description:
      "List nvm-installed Node.js versions. Uses a fixed bash bootstrap because nvm is usually a shell function, not a standalone binary.",
    command: "bash",
    args: [
      "-lc",
      'export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; nvm ls',
    ],
    runCommand,
    mapResult: createCommandResult,
  });
}

export function createNpmRunTool(
  runCommand: NodeRuntimeCliCommandRunner = executeCliCommand,
): ToolDefinition<NpmRunInput, NodeRuntimeMutationResult> {
  return createMutatingCliTool({
    name: "npm.run",
    operation: "npm_run",
    description:
      "Run an npm script through Orqent's controlled CLI adapter. Mutates local state depending on the script. Requires confirmation.",
    inputSchema: {
      type: "object",
      properties: {
        script: {
          type: "string",
          description: "npm script name to run.",
        },
        args: {
          type: "array",
          description: "Optional arguments passed after -- to the npm script.",
        },
      },
      required: [ "script" ],
      additionalProperties: false,
    },
    validateInput: validateNpmRunInput,
    runCommand,
    buildCommand(input) {
      return {
        command: "npm",
        args: input.args.length > 0
          ? [ "run", input.script, "--", ...input.args ]
          : [ "run", input.script ],
      };
    },
  });
}

export function createNpmInstallTool(
  runCommand: NodeRuntimeCliCommandRunner = executeCliCommand,
): ToolDefinition<NpmPackageMutationInput, NodeRuntimeMutationResult> {
  return createMutatingCliTool({
    name: "npm.install",
    operation: "npm_install",
    description:
      "Install npm packages through Orqent's controlled CLI adapter. Mutates package files and may use network access. Requires confirmation.",
    inputSchema: {
      type: "object",
      properties: {
        packages: {
          type: "array",
          description: "Package specs to install.",
        },
        dev: {
          type: "boolean",
          description: "Whether to install packages as dev dependencies.",
        },
      },
      required: [ "packages" ],
      additionalProperties: false,
    },
    validateInput: validateNpmPackageMutationInput,
    runCommand,
    buildCommand(input) {
      return {
        command: "npm",
        args: [
          "install",
          ...(input.dev ? [ "--save-dev" ] : []),
          ...input.packages,
        ],
      };
    },
  });
}

export function createNpmUninstallTool(
  runCommand: NodeRuntimeCliCommandRunner = executeCliCommand,
): ToolDefinition<NpmPackageMutationInput, NodeRuntimeMutationResult> {
  return createMutatingCliTool({
    name: "npm.uninstall",
    operation: "npm_uninstall",
    description:
      "Uninstall npm packages through Orqent's controlled CLI adapter. Mutates package files. Requires confirmation.",
    inputSchema: {
      type: "object",
      properties: {
        packages: {
          type: "array",
          description: "Package names to uninstall.",
        },
        dev: {
          type: "boolean",
          description: "Accepted for schema consistency; npm uninstall does not need it.",
        },
      },
      required: [ "packages" ],
      additionalProperties: false,
    },
    validateInput: validateNpmPackageMutationInput,
    runCommand,
    buildCommand(input) {
      return {
        command: "npm",
        args: [ "uninstall", ...input.packages ],
      };
    },
  });
}

export function createNvmUseTool(
  runCommand: NodeRuntimeCliCommandRunner = executeCliCommand,
): ToolDefinition<NvmVersionInput, NodeRuntimeMutationResult> {
  return createMutatingCliTool({
    name: "nvm.use",
    operation: "nvm_use",
    description:
      "Switch the active nvm Node.js version for the spawned process shell. Uses a fixed bash bootstrap. Requires confirmation.",
    inputSchema: {
      type: "object",
      properties: {
        version: {
          type: "string",
          description: "Node.js version or nvm alias to use.",
        },
      },
      required: [ "version" ],
      additionalProperties: false,
    },
    validateInput: validateNvmVersionInput,
    runCommand,
    buildCommand(input) {
      return {
        command: "bash",
        args: [
          "-lc",
          'export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; nvm use "$1"',
          "orqent-nvm-use",
          input.version,
        ],
      };
    },
  });
}

export function createNvmInstallTool(
  runCommand: NodeRuntimeCliCommandRunner = executeCliCommand,
): ToolDefinition<NvmVersionInput, NodeRuntimeMutationResult> {
  return createMutatingCliTool({
    name: "nvm.install",
    operation: "nvm_install",
    description:
      "Install a Node.js version through nvm. Uses a fixed bash bootstrap and may use network access. Requires confirmation.",
    inputSchema: {
      type: "object",
      properties: {
        version: {
          type: "string",
          description: "Node.js version or nvm alias to install.",
        },
      },
      required: [ "version" ],
      additionalProperties: false,
    },
    validateInput: validateNvmVersionInput,
    runCommand,
    buildCommand(input) {
      return {
        command: "bash",
        args: [
          "-lc",
          'export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; nvm install "$1"',
          "orqent-nvm-install",
          input.version,
        ],
      };
    },
  });
}

export const nodeVersionTool = createNodeVersionTool();
export const npmVersionTool = createNpmVersionTool();
export const npmScriptsTool = createNpmScriptsTool();
export const nvmCurrentTool = createNvmCurrentTool();
export const nvmListTool = createNvmListTool();
export const npmRunTool = createNpmRunTool();
export const npmInstallTool = createNpmInstallTool();
export const npmUninstallTool = createNpmUninstallTool();
export const nvmUseTool = createNvmUseTool();
export const nvmInstallTool = createNvmInstallTool();