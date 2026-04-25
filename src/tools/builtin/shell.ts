import { spawn } from "node:child_process";
import type {
  ToolDefinition,
  ToolExecutionContext,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
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

  return {
    ok: true,
    input: {
      command: input.command.trim(),
      args: input.args ?? [],
      stdin: input.stdin,
    },
  };
}

function runShellCommand(
  input: ShellExecuteInput,
  context: ToolExecutionContext,
): Promise<ToolExecutionResult<ShellExecuteResult>> {
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
      stdio: ["pipe", "pipe", "pipe"],
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
    required: ["command"],
    additionalProperties: false,
  },
  risk: "high",
  permissions: ["shell:execute"],
  requiresConfirmation: true,
  isReadOnly: false,
  timeoutMs: 30_000,
  retry: {
    maxAttempts: 1,
    delayMs: 0,
  },
  validateInput: validateShellExecuteInput,
  execute: runShellCommand,
};
