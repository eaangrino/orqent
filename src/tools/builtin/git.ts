import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveWithinRoot } from "../../security/paths.js";
import type { ToolDefinition, ToolResult } from "../types.js";
import { truncateUtf8 } from "../output.js";
import { asRecord, nullableInteger, nullableString, requiredString } from "../validation.js";

const execFileAsync = promisify(execFile);

type GitStatusArgs = { cwd: string | null };
type GitDiffArgs = { cwd: string | null; target: string | null; staged: boolean };
type GitLogArgs = { cwd: string | null; max_count: number | null };

async function runGit(
  args: string[],
  cwd: string,
  maxOutputBytes: number,
  signal: AbortSignal,
): Promise<ToolResult> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: Math.max(maxOutputBytes * 4, 1_000_000),
      signal,
    });
    const output = truncateUtf8(`${stdout}${stderr ? `\nSTDERR:\n${stderr}` : ""}`, maxOutputBytes);
    return {
      ok: true,
      data: { output: output.text },
      metadata: {
        truncated: output.truncated,
        original_bytes: output.originalBytes,
      },
    };
  } catch (error) {
    const details = error as {
      message?: string;
      stdout?: string;
      stderr?: string;
      code?: unknown;
    };
    return {
      ok: false,
      error: {
        code: "git_failed",
        message: details.message ?? "Git falló.",
        details: {
          exit_code: details.code,
          stdout: details.stdout,
          stderr: details.stderr,
        },
      },
    };
  }
}

export const gitStatusTool: ToolDefinition<GitStatusArgs> = {
  name: "git_status",
  description: "Muestra el estado corto y la rama actual del repositorio Git.",
  risk: "read",
  parameters: {
    type: "object",
    properties: {
      cwd: {
        type: ["string", "null"],
        description: "Subdirectorio relativo del repositorio, o null.",
      },
    },
    required: ["cwd"],
    additionalProperties: false,
  },
  parse(value): GitStatusArgs {
    const record = asRecord(value);
    return { cwd: nullableString(record, "cwd") };
  },
  async execute(args, context): Promise<ToolResult> {
    const cwd = await resolveWithinRoot(context.rootDir, args.cwd ?? ".");
    return runGit(["status", "--short", "--branch"], cwd, context.maxOutputBytes, context.signal);
  },
};

export const gitDiffTool: ToolDefinition<GitDiffArgs> = {
  name: "git_diff",
  description: "Muestra cambios Git sin modificar el repositorio.",
  risk: "read",
  parameters: {
    type: "object",
    properties: {
      cwd: { type: ["string", "null"], description: "Subdirectorio relativo, o null." },
      target: {
        type: ["string", "null"],
        description: "Ruta relativa a filtrar, o null para todos los cambios.",
      },
      staged: { type: "boolean", description: "Incluye solo cambios staged cuando es true." },
    },
    required: ["cwd", "target", "staged"],
    additionalProperties: false,
  },
  parse(value): GitDiffArgs {
    const record = asRecord(value);
    if (typeof record.staged !== "boolean") throw new Error("staged debe ser boolean.");
    return {
      cwd: nullableString(record, "cwd"),
      target: nullableString(record, "target"),
      staged: record.staged,
    };
  },
  async execute(args, context): Promise<ToolResult> {
    const cwd = await resolveWithinRoot(context.rootDir, args.cwd ?? ".");
    const command = ["diff"];
    if (args.staged) command.push("--staged");
    if (args.target) command.push("--", args.target);
    return runGit(command, cwd, context.maxOutputBytes, context.signal);
  },
};

export const gitLogTool: ToolDefinition<GitLogArgs> = {
  name: "git_log",
  description: "Lista commits recientes del repositorio Git.",
  risk: "read",
  parameters: {
    type: "object",
    properties: {
      cwd: { type: ["string", "null"], description: "Subdirectorio relativo, o null." },
      max_count: {
        type: ["integer", "null"],
        minimum: 1,
        maximum: 100,
        description: "Número de commits, o null para 20.",
      },
    },
    required: ["cwd", "max_count"],
    additionalProperties: false,
  },
  parse(value): GitLogArgs {
    const record = asRecord(value);
    return {
      cwd: nullableString(record, "cwd"),
      max_count: nullableInteger(record, "max_count", 1, 100),
    };
  },
  async execute(args, context): Promise<ToolResult> {
    const cwd = await resolveWithinRoot(context.rootDir, args.cwd ?? ".");
    return runGit(
      ["log", `--max-count=${String(args.max_count ?? 20)}`, "--date=iso", "--pretty=format:%h %ad %an %s"],
      cwd,
      context.maxOutputBytes,
      context.signal,
    );
  },
};
