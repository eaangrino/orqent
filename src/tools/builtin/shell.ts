import { spawn } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionProfile,
  ToolExecutionResult,
  ToolValidationResult,
} from "../types.js";

export type ShellExecuteInput = {
  command: string;
  args: string[];
  stdin?: string;
};

export type ShellExecuteResult = {
  command: string;
  args: string[];
  cwd: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  outputTruncated: boolean;
};

const MAX_OUTPUT_CHARS = 64_000;

const REMOVAL_COMMANDS = new Set([
  "rm",
  "rmdir",
]);

const DANGEROUS_REMOVAL_TARGETS = new Set([
  "",
  ".",
  "..",
  "/",
  "~",
]);

const HARD_BLOCKED_COMMANDS = new Set([
  "shutdown",
  "reboot",
  "halt",
  "poweroff",
  "mkfs",
  "dd",
  "fdisk",
  "parted",
]);

const SHELL_COMMAND_METACHARACTERS = [
  ";",
  "&&",
  "||",
  "|",
  ">",
  "<",
  "`",
  "$(",
  "\n",
  "\r",
];

const SHELL_INTERPRETERS = new Set([
  "bash",
  "sh",
  "zsh",
  "fish",
]);

const SCRIPT_INTERPRETERS = new Set([
  "node",
  "python",
  "python3",
  "perl",
  "ruby",
]);

const SYSTEMCTL_READ_ONLY_ACTIONS = new Set([
  "status",
  "is-active",
  "is-enabled",
  "is-failed",
  "show",
  "cat",
  "list-units",
  "list-unit-files",
  "list-dependencies",
  "help",
  "--help",
  "--version",
  "version",
]);

const SYSTEMCTL_MUTATING_ACTIONS = new Set([
  "start",
  "stop",
  "restart",
  "reload",
  "try-restart",
  "reload-or-restart",
  "enable",
  "disable",
  "reenable",
  "preset",
  "mask",
  "unmask",
  "link",
  "set-property",
  "reset-failed",
  "daemon-reload",
  "edit",
]);

const SYSTEMCTL_CRITICAL_ACTIONS = new Set([
  "reboot",
  "poweroff",
  "halt",
  "kexec",
  "rescue",
  "emergency",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function getCommandBaseName(command: string): string {
  return command.split(/[\\/]/).pop()?.toLowerCase() ?? command.toLowerCase();
}

function isPathInsideCwd(cwd: string, targetPath: string): boolean {
  const relativePath = relative(cwd, targetPath);

  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

function isRemovalCommand(command: string): boolean {
  return REMOVAL_COMMANDS.has(getCommandBaseName(command));
}

function isDangerousRemovalTarget(target: string): boolean {
  const normalized = target.trim();

  return (
    DANGEROUS_REMOVAL_TARGETS.has(normalized) ||
    normalized.startsWith("~") ||
    normalized.startsWith("$HOME") ||
    normalized.startsWith("${HOME}")
  );
}

function extractRemovalTargets(args: string[]): string[] {
  const targets: string[] = [];
  let shouldTreatRestAsTargets = false;

  for (const arg of args) {
    if (!shouldTreatRestAsTargets && arg === "--") {
      shouldTreatRestAsTargets = true;
      continue;
    }

    if (!shouldTreatRestAsTargets && arg.startsWith("-")) {
      continue;
    }

    targets.push(arg);
  }

  return targets;
}

async function resolveNearestExistingPath(path: string): Promise<string> {
  let currentPath = path;

  while (true) {
    try {
      await lstat(currentPath);
      return currentPath;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        (error as NodeJS.ErrnoException).code !== "ENOENT"
      ) {
        throw error;
      }

      const parentPath = dirname(currentPath);

      if (parentPath === currentPath) {
        return currentPath;
      }

      currentPath = parentPath;
    }
  }
}

async function validateRemovalTargetsInsideCwd(
  input: ShellExecuteInput,
  context: ToolExecutionContext,
): Promise<ToolExecutionResult | null> {
  if (!isRemovalCommand(input.command)) {
    return null;
  }

  const targets = extractRemovalTargets(input.args);

  if (targets.length === 0) {
    return {
      ok: false,
      error: {
        code: "shell_removal_missing_target",
        message: `Shell command "${getCommandBaseName(input.command)}" requires at least one explicit target.`,
      },
    };
  }

  const cwdRealPath = await realpath(context.cwd);

  for (const target of targets) {
    if (isDangerousRemovalTarget(target)) {
      return {
        ok: false,
        error: {
          code: "shell_removal_dangerous_target",
          message: `Refusing to remove dangerous target "${target}".`,
          details: {
            target,
          },
        },
      };
    }

    const resolvedTargetPath = resolve(cwdRealPath, target);

    if (!isPathInsideCwd(cwdRealPath, resolvedTargetPath)) {
      return {
        ok: false,
        error: {
          code: "shell_removal_outside_cwd",
          message: `Refusing to remove target "${target}" because it resolves outside the current working directory.`,
          details: {
            target,
            resolvedTargetPath,
            cwd: cwdRealPath,
          },
        },
      };
    }

    const nearestExistingPath = await resolveNearestExistingPath(
      resolvedTargetPath,
    );
    const nearestExistingRealPath = await realpath(nearestExistingPath);

    if (!isPathInsideCwd(cwdRealPath, nearestExistingRealPath)) {
      return {
        ok: false,
        error: {
          code: "shell_removal_outside_cwd",
          message: `Refusing to remove target "${target}" because its nearest existing path resolves outside the current working directory.`,
          details: {
            target,
            resolvedTargetPath,
            nearestExistingPath,
            nearestExistingRealPath,
            cwd: cwdRealPath,
          },
        },
      };
    }
  }

  return null;
}

function containsShellCommandMetacharacter(value: string): boolean {
  return SHELL_COMMAND_METACHARACTERS.some((metacharacter) =>
    value.includes(metacharacter),
  );
}

function hasShellExecutionFlag(args: string[]): boolean {
  return args.some((arg) =>
    arg === "-c" ||
    arg === "-lc" ||
    arg === "-ic" ||
    arg === "--command",
  );
}

function hasScriptEvaluationFlag(args: string[]): boolean {
  return args.some((arg) =>
    arg === "-e" ||
    arg === "--eval" ||
    arg === "-c",
  );
}

function getSystemctlAction(args: string[]): string | null {
  return args.find((arg) => !arg.startsWith("-"))?.toLowerCase() ?? null;
}

function validateShellSafety(
  input: ShellExecuteInput,
): ToolValidationResult<ShellExecuteInput> {
  const commandBaseName = getCommandBaseName(input.command);

  if (HARD_BLOCKED_COMMANDS.has(commandBaseName)) {
    return {
      ok: false,
      error: `Shell command "${commandBaseName}" is blocked by the safety policy.`,
    };
  }

  if (containsShellCommandMetacharacter(input.command)) {
    return {
      ok: false,
      error: "Shell command contains blocked shell metacharacters.",
    };
  }

  if (
    SHELL_INTERPRETERS.has(commandBaseName) &&
    hasShellExecutionFlag(input.args)
  ) {
    return {
      ok: false,
      error: `Shell interpreter "${commandBaseName}" with command execution flag is blocked by the safety policy.`,
    };
  }

  if (
    SCRIPT_INTERPRETERS.has(commandBaseName) &&
    hasScriptEvaluationFlag(input.args)
  ) {
    return {
      ok: false,
      error: `Script interpreter "${commandBaseName}" with evaluation flag is blocked by the safety policy.`,
    };
  }

  return {
    ok: true,
    input,
  };
}

export function getShellExecutionProfile(
  input: ShellExecuteInput,
): ToolExecutionProfile {
  const commandBaseName = getCommandBaseName(input.command);

  if (REMOVAL_COMMANDS.has(commandBaseName)) {
    return {
      risk: "high",
      permissions: [ "shell:execute" ],
      requiresConfirmation: true,
      isReadOnly: false,
    };
  }

  if (commandBaseName === "systemctl") {
    const action = getSystemctlAction(input.args);

    if (!action || SYSTEMCTL_READ_ONLY_ACTIONS.has(action)) {
      return {
        risk: "low",
        permissions: [ "shell:execute" ],
        requiresConfirmation: false,
        isReadOnly: true,
      };
    }

    if (SYSTEMCTL_CRITICAL_ACTIONS.has(action)) {
      return {
        risk: "critical",
        permissions: [ "shell:execute" ],
        requiresConfirmation: true,
        isReadOnly: false,
      };
    }

    if (SYSTEMCTL_MUTATING_ACTIONS.has(action)) {
      return {
        risk: "high",
        permissions: [ "shell:execute" ],
        requiresConfirmation: true,
        isReadOnly: false,
      };
    }

    return {
      risk: "medium",
      permissions: [ "shell:execute" ],
      requiresConfirmation: true,
      isReadOnly: false,
    };
  }

  return {
    risk: "high",
    permissions: [ "shell:execute" ],
    requiresConfirmation: true,
    isReadOnly: false,
  };
}

function truncateAppend(current: string, next: string): {
  value: string;
  truncated: boolean;
} {
  if (current.length >= MAX_OUTPUT_CHARS) {
    return {
      value: current,
      truncated: true,
    };
  }

  const available = MAX_OUTPUT_CHARS - current.length;
  const shouldTruncate = next.length > available;

  return {
    value: current + next.slice(0, available),
    truncated: shouldTruncate,
  };
}

function validateShellExecuteInput(
  input: unknown,
): ToolValidationResult<ShellExecuteInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Shell input must be an object.",
    };
  }

  if (typeof input.command !== "string" || !input.command.trim()) {
    return {
      ok: false,
      error: "Shell input requires a non-empty command string.",
    };
  }

  if (input.args !== undefined && !isStringArray(input.args)) {
    return {
      ok: false,
      error: "Shell input args must be an array of strings.",
    };
  }

  if (input.stdin !== undefined && typeof input.stdin !== "string") {
    return {
      ok: false,
      error: "Shell input stdin must be a string when provided.",
    };
  }

  const normalizedInput: ShellExecuteInput = {
    command: input.command.trim(),
    args: input.args ?? [],
    stdin: input.stdin,
  };

  return validateShellSafety(normalizedInput);
}

async function runShellCommand(
  input: ShellExecuteInput,
  context: ToolExecutionContext,
): Promise<ToolExecutionResult<ShellExecuteResult>> {
  const removalValidationError = await validateRemovalTargetsInsideCwd(
    input,
    context,
  );

  if (removalValidationError) {
    return removalValidationError as ToolExecutionResult<ShellExecuteResult>;
  }

  const startedAt = Date.now();

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let outputTruncated = false;
    let settled = false;

    const settle = (result: ToolExecutionResult<ShellExecuteResult>) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(result);
    };

    const child = spawn(input.command, input.args, {
      cwd: context.cwd,
      env: process.env,
      shell: false,
      stdio: [ "pipe", "pipe", "pipe" ],
      signal: context.signal,
    });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      const next = truncateAppend(stdout, chunk);
      stdout = next.value;
      outputTruncated = outputTruncated || next.truncated;
    });

    child.stderr.on("data", (chunk: string) => {
      const next = truncateAppend(stderr, chunk);
      stderr = next.value;
      outputTruncated = outputTruncated || next.truncated;
    });

    child.on("error", (error) => {
      settle({
        ok: false,
        error: {
          code: context.signal.aborted ? "tool_aborted" : "shell_spawn_failed",
          message: context.signal.aborted
            ? "Shell command was aborted."
            : error.message,
          details: error,
        },
        metadata: {
          durationMs: Date.now() - startedAt,
        },
      });
    });

    child.on("close", (exitCode, signal) => {
      settle({
        ok: true,
        result: {
          command: input.command,
          args: input.args,
          cwd: context.cwd,
          exitCode,
          signal,
          stdout,
          stderr,
          durationMs: Date.now() - startedAt,
          outputTruncated,
        },
      });
    });

    if (input.stdin !== undefined) {
      child.stdin.write(input.stdin);
    }

    child.stdin.end();
  });
}

export const shellExecuteTool: ToolDefinition<
  ShellExecuteInput,
  ShellExecuteResult
> = {
  name: "shell.execute",
  description:
    "Execute a local command without shell interpolation. Requires explicit confirmation.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Executable command name or absolute path.",
      },
      args: {
        type: "array",
        items: {
          type: "string",
        },
        description: "Command arguments. No shell interpolation is applied.",
      },
      stdin: {
        type: "string",
        description: "Optional stdin content passed to the process.",
      },
    },
    required: [ "command" ],
    additionalProperties: false,
  },
  risk: "high",
  permissions: [ "shell:execute" ],
  requiresConfirmation: true,
  isReadOnly: false,
  timeoutMs: 30_000,
  retry: {
    maxAttempts: 1,
    delayMs: 0,
  },
  validateInput: validateShellExecuteInput,
  getExecutionProfile: getShellExecutionProfile,
  execute: runShellCommand,
};
