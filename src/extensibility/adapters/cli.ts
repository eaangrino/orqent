import { spawn } from "node:child_process";

export type CliCommandAdapterInput = {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  maxOutputChars?: number;
  stdin?: string;
  signal?: AbortSignal;
};

export type CliCommandAdapterResult = {
  command: string;
  args: string[];
  cwd: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_CHARS = 20_000;

function normalizeCommand(value: string): string {
  const command = value.trim();

  if (!command) {
    throw new Error("CLI command cannot be empty.");
  }

  return command;
}

function normalizeArgs(value: string[] | undefined): string[] {
  if (!value) {
    return [];
  }

  return value.map((arg) => String(arg));
}

function normalizeCwd(value: string | undefined): string {
  return value?.trim() || process.cwd();
}

function normalizeTimeoutMs(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.min(300_000, Math.max(100, Math.round(value)));
}

function normalizeMaxOutputChars(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_MAX_OUTPUT_CHARS;
  }

  return Math.min(1_000_000, Math.max(1_000, Math.round(value)));
}

function appendLimitedOutput({
  current,
  chunk,
  maxChars,
}: {
  current: string;
  chunk: Buffer;
  maxChars: number;
}): {
  value: string;
  truncated: boolean;
} {
  if (current.length >= maxChars) {
    return {
      value: current,
      truncated: true,
    };
  }

  const next = current + chunk.toString("utf8");

  if (next.length <= maxChars) {
    return {
      value: next,
      truncated: false,
    };
  }

  return {
    value: next.slice(0, maxChars),
    truncated: true,
  };
}

export async function executeCliCommand(
  input: CliCommandAdapterInput,
): Promise<CliCommandAdapterResult> {
  const command = normalizeCommand(input.command);
  const args = normalizeArgs(input.args);
  const cwd = normalizeCwd(input.cwd);
  const timeoutMs = normalizeTimeoutMs(input.timeoutMs);
  const maxOutputChars = normalizeMaxOutputChars(input.maxOutputChars);

  const startedAt = Date.now();

  return await new Promise<CliCommandAdapterResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let forceKillTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...(input.env ?? {}),
      },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (forceKillTimeoutId) {
        clearTimeout(forceKillTimeoutId);
      }

      input.signal?.removeEventListener("abort", handleAbort);
    };

    const finish = (result: {
      exitCode: number | null;
      signal: NodeJS.Signals | null;
    }) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();

      resolve({
        command,
        args,
        cwd,
        exitCode: result.exitCode,
        signal: result.signal,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut,
        truncated,
      });
    };

    const terminate = () => {
      timedOut = true;

      if (!child.killed) {
        child.kill("SIGTERM");
      }

      forceKillTimeoutId = setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, 500);
    };

    const handleAbort = () => {
      terminate();
    };

    timeoutId = setTimeout(terminate, timeoutMs);

    input.signal?.addEventListener("abort", handleAbort, {
      once: true,
    });

    child.stdout.on("data", (chunk: Buffer) => {
      const result = appendLimitedOutput({
        current: stdout,
        chunk,
        maxChars: maxOutputChars,
      });

      stdout = result.value;
      truncated = truncated || result.truncated;
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const result = appendLimitedOutput({
        current: stderr,
        chunk,
        maxChars: maxOutputChars,
      });

      stderr = result.value;
      truncated = truncated || result.truncated;
    });

    child.on("error", (error) => {
      stderr = stderr ? `${stderr}\n${error.message}` : error.message;

      finish({
        exitCode: null,
        signal: null,
      });
    });

    child.on("close", (exitCode, signal) => {
      finish({
        exitCode,
        signal,
      });
    });

    if (typeof input.stdin === "string") {
      child.stdin.write(input.stdin);
    }

    child.stdin.end();
  });
}
