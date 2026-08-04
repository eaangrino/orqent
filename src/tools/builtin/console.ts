import { spawn } from "node:child_process";
import { resolveWithinRoot } from "../../security/paths.js";
import type { ToolDefinition, ToolResult } from "../types.js";
import { toolError } from "../types.js";
import { truncateUtf8 } from "../output.js";
import { asRecord, nullableInteger, nullableString, requiredString } from "../validation.js";

type ConsoleExecArgs = {
  command: string;
  cwd: string | null;
  timeout_ms: number | null;
};

export const consoleExecTool: ToolDefinition<ConsoleExecArgs> = {
  name: "console_exec",
  description:
    "Ejecuta un comando de shell usando un subdirectorio del workspace como cwd. No es un sandbox del sistema operativo; úsala para compilación, tests y tareas sin una tool específica.",
  risk: "execute",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Comando completo que debe ejecutar el shell.",
      },
      cwd: {
        type: ["string", "null"],
        description: "Directorio relativo al workspace, o null para usar la raíz.",
      },
      timeout_ms: {
        type: ["integer", "null"],
        minimum: 100,
        maximum: 300000,
        description: "Timeout en milisegundos, o null para 30000.",
      },
    },
    required: ["command", "cwd", "timeout_ms"],
    additionalProperties: false,
  },
  parse(value): ConsoleExecArgs {
    const record = asRecord(value);
    return {
      command: requiredString(record, "command"),
      cwd: nullableString(record, "cwd"),
      timeout_ms: nullableInteger(record, "timeout_ms", 100, 300_000),
    };
  },
  async execute(args, context): Promise<ToolResult> {
    const cwd = await resolveWithinRoot(context.rootDir, args.cwd ?? ".");
    const timeoutMs = args.timeout_ms ?? 30_000;

    return await new Promise<ToolResult>((resolve) => {
      const child = spawn(args.command, {
        cwd,
        shell: true,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let settled = false;

      const finish = (result: ToolResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        context.signal.removeEventListener("abort", abort);
        resolve(result);
      };

      const abort = (): void => {
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 1_000).unref();
        finish(toolError("tool_aborted", "El comando fue abortado."));
      };

      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 1_000).unref();
        finish(
          toolError(
            "tool_timeout",
            `El comando superó el timeout de ${timeoutMs} ms.`,
          ),
        );
      }, timeoutMs);

      context.signal.addEventListener("abort", abort, { once: true });
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", (error) => {
        finish(toolError("spawn_failed", error.message));
      });
      child.on("close", (code, signal) => {
        const combined = truncateUtf8(
          JSON.stringify({ stdout, stderr }),
          context.maxOutputBytes,
        );
        let parsed: { stdout: string; stderr: string };
        try {
          parsed = JSON.parse(combined.text) as { stdout: string; stderr: string };
        } catch {
          const half = Math.floor(context.maxOutputBytes / 2);
          parsed = {
            stdout: truncateUtf8(stdout, half).text,
            stderr: truncateUtf8(stderr, half).text,
          };
        }

        finish({
          ok: code === 0,
          ...(code === 0
            ? {
                data: {
                  exit_code: code,
                  signal,
                  cwd,
                  stdout: parsed.stdout,
                  stderr: parsed.stderr,
                },
              }
            : {
                error: {
                  code: "command_failed",
                  message: `El comando terminó con código ${String(code)}.`,
                  details: {
                    exit_code: code,
                    signal,
                    cwd,
                    stdout: parsed.stdout,
                    stderr: parsed.stderr,
                  },
                },
              }),
          metadata: {
            truncated: combined.truncated,
            original_bytes: combined.originalBytes,
          },
        } as ToolResult);
      });
    });
  },
};
