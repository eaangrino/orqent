import {
  executeCliCommand,
  type CliCommandAdapterInput,
  type CliCommandAdapterResult,
} from "../../extensibility/adapters/index.js";
import type {
  ToolDefinition,
  ToolExecutionResult,
  ToolValidationResult,
} from "../types.js";

export type GitStatusInput = {
  includeUntracked: boolean;
  maxEntries: number;
};

export type GitStatusEntry = {
  indexStatus: string;
  worktreeStatus: string;
  path: string;
  originalPath: string | null;
  raw: string;
};

export type GitStatusResult = {
  cwd: string;
  includeUntracked: boolean;
  maxEntries: number;
  branch: string | null;
  upstream: string | null;
  ahead: number | null;
  behind: number | null;
  count: number;
  entries: GitStatusEntry[];
  isClean: boolean;
  command: {
    command: string;
    args: string[];
  };
  durationMs: number;
  outputTruncated: boolean;
};

export type GitDiffInput = {
  staged: boolean;
  path: string | null;
  maxOutputChars: number;
};

export type GitDiffResult = {
  cwd: string;
  staged: boolean;
  path: string | null;
  diff: string;
  command: {
    command: string;
    args: string[];
  };
  durationMs: number;
  outputTruncated: boolean;
};

export type GitLogInput = {
  maxCommits: number;
  path: string | null;
};

export type GitLogCommit = {
  hash: string;
  shortHash: string;
  authorName: string;
  authorEmail: string;
  authorDate: string;
  relativeDate: string;
  subject: string;
};

export type GitLogResult = {
  cwd: string;
  maxCommits: number;
  path: string | null;
  count: number;
  commits: GitLogCommit[];
  command: {
    command: string;
    args: string[];
  };
  durationMs: number;
  outputTruncated: boolean;
};

export type GitBranchInput = {
  includeRemote: boolean;
  maxBranches: number;
};

export type GitBranchSummary = {
  name: string;
  current: boolean;
  remote: boolean;
  raw: string;
};

export type GitBranchResult = {
  cwd: string;
  includeRemote: boolean;
  maxBranches: number;
  count: number;
  branches: GitBranchSummary[];
  currentBranch: string | null;
  command: {
    command: string;
    args: string[];
  };
  durationMs: number;
  outputTruncated: boolean;
};

export type GitShowInput = {
  revision: string;
  includePatch: boolean;
  maxOutputChars: number;
};

export type GitShowResult = {
  cwd: string;
  revision: string;
  includePatch: boolean;
  output: string;
  command: {
    command: string;
    args: string[];
  };
  durationMs: number;
  outputTruncated: boolean;
};

export type GitRemotesInput = {
  maxRemotes: number;
};

export type GitRemoteEntry = {
  name: string;
  url: string;
  type: "fetch" | "push" | "other";
  raw: string;
};

export type GitRemotesResult = {
  cwd: string;
  maxRemotes: number;
  count: number;
  remotes: GitRemoteEntry[];
  command: {
    command: string;
    args: string[];
  };
  durationMs: number;
  outputTruncated: boolean;
};

export type GitCheckoutInput = {
  target: string;
  createBranch: string | null;
  detach: boolean;
};

export type GitSwitchInput = {
  branch: string;
  create: boolean;
  track: boolean;
};

export type GitAddInput = {
  paths: string[];
};

export type GitCommitInput = {
  message: string;
  allowEmpty: boolean;
};

export type GitCloneInput = {
  repositoryUrl: string;
  directory: string | null;
  branch: string | null;
  depth: number | null;
  singleBranch: boolean;
};

export type GitFetchInput = {
  remote: string | null;
  refspec: string | null;
  prune: boolean;
  tags: boolean;
};

export type GitPullInput = {
  remote: string | null;
  branch: string | null;
  rebase: boolean;
  ffOnly: boolean;
};

export type GitPushInput = {
  remote: string | null;
  branch: string | null;
  setUpstream: boolean;
  forceWithLease: boolean;
};

export type GitMutatingOperation =
  | "clone"
  | "fetch"
  | "pull"
  | "checkout"
  | "switch"
  | "add"
  | "commit"
  | "push";

export type GitMutatingResult = {
  cwd: string;
  operation: GitMutatingOperation;
  stdout: string;
  stderr: string;
  command: {
    command: string;
    args: string[];
  };
  durationMs: number;
  outputTruncated: boolean;
};

export type GitCliCommandRunner = (
  input: CliCommandAdapterInput,
) => Promise<CliCommandAdapterResult>;

const GIT_STATUS_TIMEOUT_MS = 10_000;
const GIT_STATUS_MAX_OUTPUT_CHARS = 64_000;
const GIT_MUTATION_TIMEOUT_MS = 120_000;
const GIT_MUTATION_MAX_OUTPUT_CHARS = 64_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizePositiveInteger(
  value: unknown,
  fallback: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(1, Math.round(value)));
}

function validateGitStatusInput(
  input: unknown,
): ToolValidationResult<GitStatusInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Input must be an object.",
    };
  }

  return {
    ok: true,
    input: {
      includeUntracked: normalizeBoolean(input.includeUntracked, true),
      maxEntries: normalizePositiveInteger(input.maxEntries, 200, 1000),
    },
  };
}

function buildGitStatusArgs(input: GitStatusInput): string[] {
  const args = [
    "status",
    "--short",
    "--branch",
    "--porcelain=v1",
  ];

  if (!input.includeUntracked) {
    args.push("--untracked-files=no");
  }

  return args;
}

function parseAheadBehind(value: string): {
  ahead: number | null;
  behind: number | null;
} {
  const aheadMatch = value.match(/ahead (\d+)/);
  const behindMatch = value.match(/behind (\d+)/);

  return {
    ahead: aheadMatch ? Number(aheadMatch[ 1 ]) : null,
    behind: behindMatch ? Number(behindMatch[ 1 ]) : null,
  };
}

function parseBranchLine(value: string): {
  branch: string | null;
  upstream: string | null;
  ahead: number | null;
  behind: number | null;
} {
  const content = value.replace(/^##\s*/, "").trim();
  const [ branchPart, metadataPart ] = content.split(" [", 2);
  const [ branch, upstream ] = branchPart.split("...", 2);
  const aheadBehind = parseAheadBehind(metadataPart ?? "");

  return {
    branch: branch?.trim() || null,
    upstream: upstream?.trim() || null,
    ahead: aheadBehind.ahead,
    behind: aheadBehind.behind,
  };
}

function parseGitStatusEntry(line: string): GitStatusEntry | null {
  if (line.length < 4) {
    return null;
  }

  const indexStatus = line[ 0 ] ?? " ";
  const worktreeStatus = line[ 1 ] ?? " ";
  const rawPath = line.slice(3).trim();

  if (!rawPath) {
    return null;
  }

  const renameParts = rawPath.split(" -> ");

  if (renameParts.length === 2) {
    return {
      indexStatus,
      worktreeStatus,
      originalPath: renameParts[ 0 ]?.trim() || null,
      path: renameParts[ 1 ]?.trim() || rawPath,
      raw: line,
    };
  }

  return {
    indexStatus,
    worktreeStatus,
    path: rawPath,
    originalPath: null,
    raw: line,
  };
}

function parseGitStatusOutput(stdout: string): Omit<
  GitStatusResult,
  | "cwd"
  | "includeUntracked"
  | "maxEntries"
  | "count"
  | "isClean"
  | "command"
  | "durationMs"
  | "outputTruncated"
> {
  let branch: string | null = null;
  let upstream: string | null = null;
  let ahead: number | null = null;
  let behind: number | null = null;
  const entries: GitStatusEntry[] = [];

  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.replace(/\r$/, "");

    if (!line) {
      continue;
    }

    if (line.startsWith("## ")) {
      const parsedBranch = parseBranchLine(line);

      branch = parsedBranch.branch;
      upstream = parsedBranch.upstream;
      ahead = parsedBranch.ahead;
      behind = parsedBranch.behind;
      continue;
    }

    const entry = parseGitStatusEntry(line);

    if (entry) {
      entries.push(entry);
    }
  }

  return {
    branch,
    upstream,
    ahead,
    behind,
    entries,
  };
}

function createGitStatusError(
  result: CliCommandAdapterResult,
): ToolExecutionResult<GitStatusResult> {
  if (result.timedOut) {
    return {
      ok: false,
      error: {
        code: "git_status_timed_out",
        message: "git status timed out.",
        details: result,
      },
      metadata: {
        adapter: "cli",
        command: "git",
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        truncated: result.truncated,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "git_status_failed",
      message:
        result.stderr.trim() ||
        `git status failed with exit code ${String(result.exitCode)}.`,
      details: result,
    },
    metadata: {
      adapter: "cli",
      command: "git",
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      truncated: result.truncated,
    },
  };
}

function normalizeNullablePath(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const path = value.trim();

  if (/[\r\n]/.test(path)) {
    return null;
  }

  return path;
}

function validateGitDiffInput(
  input: unknown,
): ToolValidationResult<GitDiffInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Input must be an object.",
    };
  }

  return {
    ok: true,
    input: {
      staged: normalizeBoolean(input.staged, false),
      path: normalizeNullablePath(input.path),
      maxOutputChars: normalizePositiveInteger(
        input.maxOutputChars,
        GIT_STATUS_MAX_OUTPUT_CHARS,
        500_000,
      ),
    },
  };
}

function buildGitDiffArgs(input: GitDiffInput): string[] {
  const args = [ "diff", "--no-ext-diff" ];

  if (input.staged) {
    args.push("--cached");
  }

  if (input.path) {
    args.push("--", input.path);
  }

  return args;
}

function createGitDiffError(
  result: CliCommandAdapterResult,
): ToolExecutionResult<GitDiffResult> {
  if (result.timedOut) {
    return {
      ok: false,
      error: {
        code: "git_diff_timed_out",
        message: "git diff timed out.",
        details: result,
      },
      metadata: {
        adapter: "cli",
        command: "git",
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        truncated: result.truncated,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "git_diff_failed",
      message:
        result.stderr.trim() ||
        `git diff failed with exit code ${String(result.exitCode)}.`,
      details: result,
    },
    metadata: {
      adapter: "cli",
      command: "git",
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      truncated: result.truncated,
    },
  };
}

export function createGitDiffTool(
  runCommand: GitCliCommandRunner = executeCliCommand,
): ToolDefinition<GitDiffInput, GitDiffResult> {
  return {
    name: "git.diff",
    description:
      "Read Git diff using git diff through Orqent's controlled CLI adapter. Read-only. Does not execute arbitrary Git commands.",
    inputSchema: {
      type: "object",
      properties: {
        staged: {
          type: "boolean",
          description:
            "When true, read staged diff using git diff --cached.",
        },
        path: {
          type: "string",
          description:
            "Optional file path to limit the diff. Must not contain line breaks.",
        },
        maxOutputChars: {
          type: "number",
          description:
            "Maximum number of diff characters to return. Defaults to adapter limit.",
        },
      },
      additionalProperties: false,
    },
    risk: "low",
    permissions: [ "shell:execute" ],
    requiresConfirmation: false,
    isReadOnly: true,
    timeoutMs: GIT_STATUS_TIMEOUT_MS,
    retry: {
      maxAttempts: 1,
      delayMs: 0,
    },
    validateInput: validateGitDiffInput,
    async execute(input, context) {
      const args = buildGitDiffArgs(input);

      const result = await runCommand({
        command: "git",
        args,
        cwd: context.cwd,
        timeoutMs: GIT_STATUS_TIMEOUT_MS,
        maxOutputChars: input.maxOutputChars,
        signal: context.signal,
      });

      if (result.exitCode !== 0) {
        return createGitDiffError(result);
      }

      return {
        ok: true,
        result: {
          cwd: context.cwd,
          staged: input.staged,
          path: input.path,
          diff: result.stdout,
          command: {
            command: "git",
            args,
          },
          durationMs: result.durationMs,
          outputTruncated: result.truncated,
        },
        metadata: {
          adapter: "cli",
          command: "git",
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          truncated: result.truncated,
        },
      };
    },
  };
}

function validateGitLogInput(
  input: unknown,
): ToolValidationResult<GitLogInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Input must be an object.",
    };
  }

  return {
    ok: true,
    input: {
      maxCommits: normalizePositiveInteger(input.maxCommits, 20, 200),
      path: normalizeNullablePath(input.path),
    },
  };
}

function buildGitLogArgs(input: GitLogInput): string[] {
  const format = [
    "%H",
    "%h",
    "%an",
    "%ae",
    "%aI",
    "%ar",
    "%s",
  ].join("%x1f");

  const args = [
    "log",
    `--max-count=${input.maxCommits}`,
    `--format=${format}`,
  ];

  if (input.path) {
    args.push("--", input.path);
  }

  return args;
}

function parseGitLogOutput(stdout: string): GitLogCommit[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const [
        hash,
        shortHash,
        authorName,
        authorEmail,
        authorDate,
        relativeDate,
        subject,
      ] = line.split("\x1f");

      if (!hash || !shortHash) {
        return [];
      }

      return [
        {
          hash,
          shortHash,
          authorName: authorName ?? "",
          authorEmail: authorEmail ?? "",
          authorDate: authorDate ?? "",
          relativeDate: relativeDate ?? "",
          subject: subject ?? "",
        },
      ];
    });
}

function createGitLogError(
  result: CliCommandAdapterResult,
): ToolExecutionResult<GitLogResult> {
  if (result.timedOut) {
    return {
      ok: false,
      error: {
        code: "git_log_timed_out",
        message: "git log timed out.",
        details: result,
      },
      metadata: {
        adapter: "cli",
        command: "git",
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        truncated: result.truncated,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "git_log_failed",
      message:
        result.stderr.trim() ||
        `git log failed with exit code ${String(result.exitCode)}.`,
      details: result,
    },
    metadata: {
      adapter: "cli",
      command: "git",
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      truncated: result.truncated,
    },
  };
}

export function createGitLogTool(
  runCommand: GitCliCommandRunner = executeCliCommand,
): ToolDefinition<GitLogInput, GitLogResult> {
  return {
    name: "git.log",
    description:
      "Read recent Git commit history using git log through Orqent's controlled CLI adapter. Read-only. Does not execute arbitrary Git commands.",
    inputSchema: {
      type: "object",
      properties: {
        maxCommits: {
          type: "number",
          description:
            "Maximum number of commits to return. Defaults to 20 and is capped at 200.",
        },
        path: {
          type: "string",
          description:
            "Optional file path to limit the log. Must not contain line breaks.",
        },
      },
      additionalProperties: false,
    },
    risk: "low",
    permissions: [ "shell:execute" ],
    requiresConfirmation: false,
    isReadOnly: true,
    timeoutMs: GIT_STATUS_TIMEOUT_MS,
    retry: {
      maxAttempts: 1,
      delayMs: 0,
    },
    validateInput: validateGitLogInput,
    async execute(input, context) {
      const args = buildGitLogArgs(input);

      const result = await runCommand({
        command: "git",
        args,
        cwd: context.cwd,
        timeoutMs: GIT_STATUS_TIMEOUT_MS,
        maxOutputChars: GIT_STATUS_MAX_OUTPUT_CHARS,
        signal: context.signal,
      });

      if (result.exitCode !== 0) {
        return createGitLogError(result);
      }

      const commits = parseGitLogOutput(result.stdout).slice(
        0,
        input.maxCommits,
      );

      return {
        ok: true,
        result: {
          cwd: context.cwd,
          maxCommits: input.maxCommits,
          path: input.path,
          count: commits.length,
          commits,
          command: {
            command: "git",
            args,
          },
          durationMs: result.durationMs,
          outputTruncated: result.truncated,
        },
        metadata: {
          adapter: "cli",
          command: "git",
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          truncated: result.truncated,
        },
      };
    },
  };
}

function validateGitBranchInput(
  input: unknown,
): ToolValidationResult<GitBranchInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Input must be an object.",
    };
  }

  return {
    ok: true,
    input: {
      includeRemote: normalizeBoolean(input.includeRemote, false),
      maxBranches: normalizePositiveInteger(input.maxBranches, 100, 500),
    },
  };
}

function buildGitBranchArgs(input: GitBranchInput): string[] {
  const args = [ "branch", "--no-color" ];

  if (input.includeRemote) {
    args.push("--all");
  }

  return args;
}

function parseGitBranchOutput(stdout: string): GitBranchSummary[] {
  return stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .flatMap((line) => {
      const current = line.startsWith("*");
      const cleaned = line.replace(/^\*\s*/, "").trim();

      if (!cleaned || cleaned.includes(" -> ")) {
        return [];
      }

      return [
        {
          name: cleaned,
          current,
          remote: cleaned.startsWith("remotes/"),
          raw: line,
        },
      ];
    });
}

function createGitBranchError(
  result: CliCommandAdapterResult,
): ToolExecutionResult<GitBranchResult> {
  if (result.timedOut) {
    return {
      ok: false,
      error: {
        code: "git_branch_timed_out",
        message: "git branch timed out.",
        details: result,
      },
      metadata: {
        adapter: "cli",
        command: "git",
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        truncated: result.truncated,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "git_branch_failed",
      message:
        result.stderr.trim() ||
        `git branch failed with exit code ${String(result.exitCode)}.`,
      details: result,
    },
    metadata: {
      adapter: "cli",
      command: "git",
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      truncated: result.truncated,
    },
  };
}

export function createGitBranchTool(
  runCommand: GitCliCommandRunner = executeCliCommand,
): ToolDefinition<GitBranchInput, GitBranchResult> {
  return {
    name: "git.branch",
    description:
      "List Git branches using git branch through Orqent's controlled CLI adapter. Read-only. Does not execute arbitrary Git commands.",
    inputSchema: {
      type: "object",
      properties: {
        includeRemote: {
          type: "boolean",
          description:
            "When true, include remote branches using git branch --all.",
        },
        maxBranches: {
          type: "number",
          description:
            "Maximum number of branches to return from parsed output.",
        },
      },
      additionalProperties: false,
    },
    risk: "low",
    permissions: [ "shell:execute" ],
    requiresConfirmation: false,
    isReadOnly: true,
    timeoutMs: GIT_STATUS_TIMEOUT_MS,
    retry: {
      maxAttempts: 1,
      delayMs: 0,
    },
    validateInput: validateGitBranchInput,
    async execute(input, context) {
      const args = buildGitBranchArgs(input);

      const result = await runCommand({
        command: "git",
        args,
        cwd: context.cwd,
        timeoutMs: GIT_STATUS_TIMEOUT_MS,
        maxOutputChars: GIT_STATUS_MAX_OUTPUT_CHARS,
        signal: context.signal,
      });

      if (result.exitCode !== 0) {
        return createGitBranchError(result);
      }

      const allBranches = parseGitBranchOutput(result.stdout);
      const branches = allBranches.slice(0, input.maxBranches);
      const currentBranch =
        allBranches.find((branch) => branch.current)?.name ?? null;

      return {
        ok: true,
        result: {
          cwd: context.cwd,
          includeRemote: input.includeRemote,
          maxBranches: input.maxBranches,
          count: branches.length,
          branches,
          currentBranch,
          command: {
            command: "git",
            args,
          },
          durationMs: result.durationMs,
          outputTruncated: result.truncated,
        },
        metadata: {
          adapter: "cli",
          command: "git",
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          truncated: result.truncated,
        },
      };
    },
  };
}

function normalizeRevision(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const revision = value.trim();

  if (/[\r\n]/.test(revision)) {
    return null;
  }

  return revision;
}

function validateGitShowInput(
  input: unknown,
): ToolValidationResult<GitShowInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Input must be an object.",
    };
  }

  const revision = normalizeRevision(input.revision);

  if (!revision) {
    return {
      ok: false,
      error: "revision must be a non-empty string without line breaks.",
    };
  }

  return {
    ok: true,
    input: {
      revision,
      includePatch: normalizeBoolean(input.includePatch, false),
      maxOutputChars: normalizePositiveInteger(
        input.maxOutputChars,
        GIT_STATUS_MAX_OUTPUT_CHARS,
        500_000,
      ),
    },
  };
}

function buildGitShowArgs(input: GitShowInput): string[] {
  const args = [
    "show",
    "--no-ext-diff",
    "--no-color",
    "--stat",
  ];

  if (!input.includePatch) {
    args.push("--no-patch");
  }

  args.push(input.revision);

  return args;
}

function createGitShowError(
  result: CliCommandAdapterResult,
): ToolExecutionResult<GitShowResult> {
  if (result.timedOut) {
    return {
      ok: false,
      error: {
        code: "git_show_timed_out",
        message: "git show timed out.",
        details: result,
      },
      metadata: {
        adapter: "cli",
        command: "git",
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        truncated: result.truncated,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "git_show_failed",
      message:
        result.stderr.trim() ||
        `git show failed with exit code ${String(result.exitCode)}.`,
      details: result,
    },
    metadata: {
      adapter: "cli",
      command: "git",
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      truncated: result.truncated,
    },
  };
}

export function createGitShowTool(
  runCommand: GitCliCommandRunner = executeCliCommand,
): ToolDefinition<GitShowInput, GitShowResult> {
  return {
    name: "git.show",
    description:
      "Read a Git revision using git show through Orqent's controlled CLI adapter. Read-only. Does not execute arbitrary Git commands.",
    inputSchema: {
      type: "object",
      properties: {
        revision: {
          type: "string",
          description:
            "Git revision, commit hash, branch, tag, or ref to show. Must not contain line breaks.",
        },
        includePatch: {
          type: "boolean",
          description:
            "When true, include the patch. Defaults to false and returns metadata/stat only.",
        },
        maxOutputChars: {
          type: "number",
          description:
            "Maximum number of characters to return from git show.",
        },
      },
      required: [ "revision" ],
      additionalProperties: false,
    },
    risk: "low",
    permissions: [ "shell:execute" ],
    requiresConfirmation: false,
    isReadOnly: true,
    timeoutMs: GIT_STATUS_TIMEOUT_MS,
    retry: {
      maxAttempts: 1,
      delayMs: 0,
    },
    validateInput: validateGitShowInput,
    async execute(input, context) {
      const args = buildGitShowArgs(input);

      const result = await runCommand({
        command: "git",
        args,
        cwd: context.cwd,
        timeoutMs: GIT_STATUS_TIMEOUT_MS,
        maxOutputChars: input.maxOutputChars,
        signal: context.signal,
      });

      if (result.exitCode !== 0) {
        return createGitShowError(result);
      }

      return {
        ok: true,
        result: {
          cwd: context.cwd,
          revision: input.revision,
          includePatch: input.includePatch,
          output: result.stdout,
          command: {
            command: "git",
            args,
          },
          durationMs: result.durationMs,
          outputTruncated: result.truncated,
        },
        metadata: {
          adapter: "cli",
          command: "git",
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          truncated: result.truncated,
        },
      };
    },
  };
}

function validateGitRemotesInput(
  input: unknown,
): ToolValidationResult<GitRemotesInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Input must be an object.",
    };
  }

  return {
    ok: true,
    input: {
      maxRemotes: normalizePositiveInteger(input.maxRemotes, 50, 200),
    },
  };
}

function buildGitRemotesArgs(): string[] {
  return [ "remote", "-v" ];
}

function sanitizeRemoteUrl(value: string): string {
  try {
    const url = new URL(value);

    if (url.username || url.password) {
      url.username = "redacted";
      url.password = url.password ? "redacted" : "";
    }

    return url.toString();
  } catch {
    return value.replace(
      /(https?:\/\/)([^/@\s]+)@/gi,
      "$1redacted@",
    );
  }
}

function parseGitRemoteType(value: string): GitRemoteEntry[ "type" ] {
  if (value === "(fetch)") {
    return "fetch";
  }

  if (value === "(push)") {
    return "push";
  }

  return "other";
}

function parseGitRemotesOutput(stdout: string): GitRemoteEntry[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const parts = line.split(/\s+/);

      const name = parts[ 0 ]?.trim() ?? "";
      const url = parts[ 1 ]?.trim() ?? "";
      const rawType = parts[ 2 ]?.trim() ?? "";

      if (!name || !url) {
        return [];
      }

      const sanitizedUrl = sanitizeRemoteUrl(url);
      const type = parseGitRemoteType(rawType);

      return [
        {
          name,
          url: sanitizedUrl,
          type,
          raw: [ name, sanitizedUrl, rawType ].filter(Boolean).join(" "),
        },
      ];
    });
}

function createGitRemotesError(
  result: CliCommandAdapterResult,
): ToolExecutionResult<GitRemotesResult> {
  if (result.timedOut) {
    return {
      ok: false,
      error: {
        code: "git_remotes_timed_out",
        message: "git remote -v timed out.",
        details: result,
      },
      metadata: {
        adapter: "cli",
        command: "git",
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        truncated: result.truncated,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "git_remotes_failed",
      message:
        result.stderr.trim() ||
        `git remote -v failed with exit code ${String(result.exitCode)}.`,
      details: result,
    },
    metadata: {
      adapter: "cli",
      command: "git",
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      truncated: result.truncated,
    },
  };
}

export function createGitRemotesTool(
  runCommand: GitCliCommandRunner = executeCliCommand,
): ToolDefinition<GitRemotesInput, GitRemotesResult> {
  return {
    name: "git.remotes",
    description:
      "List Git remotes using git remote -v through Orqent's controlled CLI adapter. Read-only. Sanitizes URL credentials before returning results.",
    inputSchema: {
      type: "object",
      properties: {
        maxRemotes: {
          type: "number",
          description:
            "Maximum number of remote entries to return from parsed output.",
        },
      },
      additionalProperties: false,
    },
    risk: "low",
    permissions: [ "shell:execute" ],
    requiresConfirmation: false,
    isReadOnly: true,
    timeoutMs: GIT_STATUS_TIMEOUT_MS,
    retry: {
      maxAttempts: 1,
      delayMs: 0,
    },
    validateInput: validateGitRemotesInput,
    async execute(input, context) {
      const args = buildGitRemotesArgs();

      const result = await runCommand({
        command: "git",
        args,
        cwd: context.cwd,
        timeoutMs: GIT_STATUS_TIMEOUT_MS,
        maxOutputChars: GIT_STATUS_MAX_OUTPUT_CHARS,
        signal: context.signal,
      });

      if (result.exitCode !== 0) {
        return createGitRemotesError(result);
      }

      const remotes = parseGitRemotesOutput(result.stdout).slice(
        0,
        input.maxRemotes,
      );

      return {
        ok: true,
        result: {
          cwd: context.cwd,
          maxRemotes: input.maxRemotes,
          count: remotes.length,
          remotes,
          command: {
            command: "git",
            args,
          },
          durationMs: result.durationMs,
          outputTruncated: result.truncated,
        },
        metadata: {
          adapter: "cli",
          command: "git",
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          truncated: result.truncated,
        },
      };
    },
  };
}

export function createGitStatusTool(
  runCommand: GitCliCommandRunner = executeCliCommand,
): ToolDefinition<GitStatusInput, GitStatusResult> {
  return {
    name: "git.status",
    description:
      "Read Git working tree status using git status through Orqent's controlled CLI adapter. Read-only. Does not execute arbitrary Git commands.",
    inputSchema: {
      type: "object",
      properties: {
        includeUntracked: {
          type: "boolean",
          description:
            "When true, include untracked files. Defaults to true.",
        },
        maxEntries: {
          type: "number",
          description:
            "Maximum number of status entries to return from parsed output.",
        },
      },
      additionalProperties: false,
    },
    risk: "low",
    permissions: [ "shell:execute" ],
    requiresConfirmation: false,
    isReadOnly: true,
    timeoutMs: GIT_STATUS_TIMEOUT_MS,
    retry: {
      maxAttempts: 1,
      delayMs: 0,
    },
    validateInput: validateGitStatusInput,
    async execute(input, context) {
      const args = buildGitStatusArgs(input);

      const result = await runCommand({
        command: "git",
        args,
        cwd: context.cwd,
        timeoutMs: GIT_STATUS_TIMEOUT_MS,
        maxOutputChars: GIT_STATUS_MAX_OUTPUT_CHARS,
        signal: context.signal,
      });

      if (result.exitCode !== 0) {
        return createGitStatusError(result);
      }

      const parsed = parseGitStatusOutput(result.stdout);
      const entries = parsed.entries.slice(0, input.maxEntries);

      return {
        ok: true,
        result: {
          cwd: context.cwd,
          includeUntracked: input.includeUntracked,
          maxEntries: input.maxEntries,
          branch: parsed.branch,
          upstream: parsed.upstream,
          ahead: parsed.ahead,
          behind: parsed.behind,
          count: entries.length,
          entries,
          isClean: parsed.entries.length === 0,
          command: {
            command: "git",
            args,
          },
          durationMs: result.durationMs,
          outputTruncated: result.truncated,
        },
        metadata: {
          adapter: "cli",
          command: "git",
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          truncated: result.truncated,
        },
      };
    },
  };
}

function sanitizeGitOutput(value: string): string {
  return value.replace(
    /(https?:\/\/)([^/@\s]+)@/gi,
    "$1redacted@",
  );
}

function sanitizeGitCliResult(
  result: CliCommandAdapterResult,
): CliCommandAdapterResult {
  return {
    ...result,
    args: result.args.map(sanitizeGitOutput),
    stdout: sanitizeGitOutput(result.stdout),
    stderr: sanitizeGitOutput(result.stderr),
  };
}

function hasEmbeddedHttpCredentials(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      Boolean(url.username || url.password)
    );
  } catch {
    return /https?:\/\/[^/\s@]+@/i.test(value);
  }
}

function normalizeRequiredGitArgument(
  value: unknown,
  fieldName: string,
): ToolValidationResult<string> {
  if (typeof value !== "string" || !value.trim()) {
    return {
      ok: false,
      error: `${fieldName} must be a non-empty string without line breaks and must not start with '-'.`,
    };
  }

  const normalized = value.trim();

  if (/[\r\n]/.test(normalized) || normalized.startsWith("-")) {
    return {
      ok: false,
      error: `${fieldName} must be a non-empty string without line breaks and must not start with '-'.`,
    };
  }

  return {
    ok: true,
    input: normalized,
  };
}

function normalizeOptionalGitArgument(
  value: unknown,
  fieldName: string,
): ToolValidationResult<string | null> {
  if (value === undefined || value === null) {
    return {
      ok: true,
      input: null,
    };
  }

  if (typeof value !== "string") {
    return {
      ok: false,
      error: `${fieldName} must be a string without line breaks and must not start with '-' when provided.`,
    };
  }

  const normalized = value.trim();

  if (!normalized) {
    return {
      ok: true,
      input: null,
    };
  }

  if (/[\r\n]/.test(normalized) || normalized.startsWith("-")) {
    return {
      ok: false,
      error: `${fieldName} must be a string without line breaks and must not start with '-' when provided.`,
    };
  }

  return {
    ok: true,
    input: normalized,
  };
}

function normalizeOptionalDepth(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  return normalizePositiveInteger(value, 1, 100_000);
}

function createGitMutatingError(
  operation: GitMutatingOperation,
  result: CliCommandAdapterResult,
): ToolExecutionResult<GitMutatingResult> {
  const sanitizedResult = sanitizeGitCliResult(result);

  if (result.timedOut) {
    return {
      ok: false,
      error: {
        code: `git_${operation}_timed_out`,
        message: `git ${operation} timed out.`,
        details: sanitizedResult,
      },
      metadata: {
        adapter: "cli",
        command: "git",
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        truncated: result.truncated,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: `git_${operation}_failed`,
      message:
        sanitizeGitOutput(result.stderr.trim()) ||
        `git ${operation} failed with exit code ${String(result.exitCode)}.`,
      details: sanitizedResult,
    },
    metadata: {
      adapter: "cli",
      command: "git",
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      truncated: result.truncated,
    },
  };
}

function validateGitCloneInput(
  input: unknown,
): ToolValidationResult<GitCloneInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Input must be an object.",
    };
  }

  const repositoryUrl = normalizeRequiredGitArgument(
    input.repositoryUrl,
    "repositoryUrl",
  );

  if (!repositoryUrl.ok) {
    return repositoryUrl;
  }

  if (hasEmbeddedHttpCredentials(repositoryUrl.input)) {
    return {
      ok: false,
      error:
        "repositoryUrl must not include embedded HTTP credentials. Use configured Git credentials or SSH instead.",
    };
  }

  const directory = normalizeOptionalGitArgument(input.directory, "directory");

  if (!directory.ok) {
    return directory;
  }

  const branch = normalizeOptionalGitArgument(input.branch, "branch");

  if (!branch.ok) {
    return branch;
  }

  return {
    ok: true,
    input: {
      repositoryUrl: repositoryUrl.input,
      directory: directory.input,
      branch: branch.input,
      depth: normalizeOptionalDepth(input.depth),
      singleBranch: normalizeBoolean(input.singleBranch, false),
    },
  };
}

function buildGitCloneArgs(input: GitCloneInput): string[] {
  const args = [ "clone" ];

  if (input.depth !== null) {
    args.push("--depth", String(input.depth));
  }

  if (input.singleBranch) {
    args.push("--single-branch");
  }

  if (input.branch) {
    args.push("--branch", input.branch);
  }

  args.push("--", input.repositoryUrl);

  if (input.directory) {
    args.push(input.directory);
  }

  return args;
}

function validateGitFetchInput(
  input: unknown,
): ToolValidationResult<GitFetchInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Input must be an object.",
    };
  }

  const remote = normalizeOptionalGitArgument(input.remote, "remote");

  if (!remote.ok) {
    return remote;
  }

  const refspec = normalizeOptionalGitArgument(input.refspec, "refspec");

  if (!refspec.ok) {
    return refspec;
  }

  return {
    ok: true,
    input: {
      remote: remote.input,
      refspec: refspec.input,
      prune: normalizeBoolean(input.prune, false),
      tags: normalizeBoolean(input.tags, false),
    },
  };
}

function buildGitFetchArgs(input: GitFetchInput): string[] {
  const args = [ "fetch" ];

  if (input.prune) {
    args.push("--prune");
  }

  if (input.tags) {
    args.push("--tags");
  }

  if (input.remote) {
    args.push(input.remote);
  }

  if (input.refspec) {
    args.push(input.refspec);
  }

  return args;
}

function validateGitPullInput(
  input: unknown,
): ToolValidationResult<GitPullInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Input must be an object.",
    };
  }

  const remote = normalizeOptionalGitArgument(input.remote, "remote");

  if (!remote.ok) {
    return remote;
  }

  const branch = normalizeOptionalGitArgument(input.branch, "branch");

  if (!branch.ok) {
    return branch;
  }

  return {
    ok: true,
    input: {
      remote: remote.input,
      branch: branch.input,
      rebase: normalizeBoolean(input.rebase, false),
      ffOnly: normalizeBoolean(input.ffOnly, true),
    },
  };
}

function buildGitPullArgs(input: GitPullInput): string[] {
  const args = [ "pull" ];

  if (input.rebase) {
    args.push("--rebase");
  } else if (input.ffOnly) {
    args.push("--ff-only");
  }

  if (input.remote) {
    args.push(input.remote);
  }

  if (input.branch) {
    args.push(input.branch);
  }

  return args;
}

function validateGitCheckoutInput(
  input: unknown,
): ToolValidationResult<GitCheckoutInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Input must be an object.",
    };
  }

  const target = normalizeRequiredGitArgument(input.target, "target");

  if (!target.ok) {
    return target;
  }

  const createBranch = normalizeOptionalGitArgument(
    input.createBranch,
    "createBranch",
  );

  if (!createBranch.ok) {
    return createBranch;
  }

  return {
    ok: true,
    input: {
      target: target.input,
      createBranch: createBranch.input,
      detach: normalizeBoolean(input.detach, false),
    },
  };
}

function buildGitCheckoutArgs(input: GitCheckoutInput): string[] {
  if (input.createBranch) {
    return [ "checkout", "-b", input.createBranch, input.target ];
  }

  if (input.detach) {
    return [ "checkout", "--detach", input.target ];
  }

  return [ "checkout", input.target ];
}

function validateGitSwitchInput(
  input: unknown,
): ToolValidationResult<GitSwitchInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Input must be an object.",
    };
  }

  const branch = normalizeRequiredGitArgument(input.branch, "branch");

  if (!branch.ok) {
    return branch;
  }

  return {
    ok: true,
    input: {
      branch: branch.input,
      create: normalizeBoolean(input.create, false),
      track: normalizeBoolean(input.track, false),
    },
  };
}

function buildGitSwitchArgs(input: GitSwitchInput): string[] {
  const args = [ "switch" ];

  if (input.create) {
    args.push("--create");
  }

  if (input.track) {
    args.push("--track");
  }

  args.push(input.branch);

  return args;
}

function normalizeGitAddPaths(value: unknown): ToolValidationResult<string[]> {
  if (!Array.isArray(value)) {
    return {
      ok: false,
      error: "paths must be a non-empty array of path strings.",
    };
  }

  const paths = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  if (paths.length === 0) {
    return {
      ok: false,
      error: "paths must be a non-empty array of path strings.",
    };
  }

  if (paths.some((path) => /[\r\n]/.test(path) || path.startsWith("-"))) {
    return {
      ok: false,
      error:
        "paths must not contain line breaks and must not start with '-'.",
    };
  }

  return {
    ok: true,
    input: paths,
  };
}

function validateGitAddInput(
  input: unknown,
): ToolValidationResult<GitAddInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Input must be an object.",
    };
  }

  const paths = normalizeGitAddPaths(input.paths);

  if (!paths.ok) {
    return paths;
  }

  return {
    ok: true,
    input: {
      paths: paths.input,
    },
  };
}

function buildGitAddArgs(input: GitAddInput): string[] {
  return [ "add", "--", ...input.paths ];
}

function validateGitCommitInput(
  input: unknown,
): ToolValidationResult<GitCommitInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Input must be an object.",
    };
  }

  if (typeof input.message !== "string" || !input.message.trim()) {
    return {
      ok: false,
      error: "message must be a non-empty string.",
    };
  }

  const message = input.message.trim();

  if (message.includes("\0")) {
    return {
      ok: false,
      error: "message must not contain null bytes.",
    };
  }

  return {
    ok: true,
    input: {
      message,
      allowEmpty: normalizeBoolean(input.allowEmpty, false),
    },
  };
}

function buildGitCommitArgs(input: GitCommitInput): string[] {
  const args = [ "commit", "-m", input.message ];

  if (input.allowEmpty) {
    args.push("--allow-empty");
  }

  return args;
}

function validateGitPushInput(
  input: unknown,
): ToolValidationResult<GitPushInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Input must be an object.",
    };
  }

  const remote = normalizeOptionalGitArgument(input.remote, "remote");

  if (!remote.ok) {
    return remote;
  }

  const branch = normalizeOptionalGitArgument(input.branch, "branch");

  if (!branch.ok) {
    return branch;
  }

  const setUpstream = normalizeBoolean(input.setUpstream, false);

  if (branch.input && !remote.input) {
    return {
      ok: false,
      error: "branch requires remote when provided.",
    };
  }

  if (setUpstream && (!remote.input || !branch.input)) {
    return {
      ok: false,
      error: "setUpstream requires both remote and branch.",
    };
  }

  return {
    ok: true,
    input: {
      remote: remote.input,
      branch: branch.input,
      setUpstream,
      forceWithLease: normalizeBoolean(input.forceWithLease, false),
    },
  };
}

function buildGitPushArgs(input: GitPushInput): string[] {
  const args = [ "push" ];

  if (input.setUpstream) {
    args.push("--set-upstream");
  }

  if (input.forceWithLease) {
    args.push("--force-with-lease");
  }

  if (input.remote) {
    args.push(input.remote);
  }

  if (input.branch) {
    args.push(input.branch);
  }

  return args;
}

function createGitMutatingTool<TInput>(
  config: {
    name: string;
    operation: GitMutatingOperation;
    description: string;
    inputSchema: ToolDefinition<TInput, GitMutatingResult>[ "inputSchema" ];
    validateInput: (input: unknown) => ToolValidationResult<TInput>;
    buildArgs: (input: TInput) => string[];
  },
  runCommand: GitCliCommandRunner = executeCliCommand,
): ToolDefinition<TInput, GitMutatingResult> {
  return {
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    risk: "high",
    permissions: [ "shell:execute" ],
    requiresConfirmation: true,
    isReadOnly: false,
    timeoutMs: GIT_MUTATION_TIMEOUT_MS,
    retry: {
      maxAttempts: 1,
      delayMs: 0,
    },
    validateInput: config.validateInput,
    async execute(input, context) {
      const args = config.buildArgs(input);

      const result = await runCommand({
        command: "git",
        args,
        cwd: context.cwd,
        timeoutMs: GIT_MUTATION_TIMEOUT_MS,
        maxOutputChars: GIT_MUTATION_MAX_OUTPUT_CHARS,
        signal: context.signal,
      });

      if (result.exitCode !== 0) {
        return createGitMutatingError(config.operation, result);
      }

      return {
        ok: true,
        result: {
          cwd: context.cwd,
          operation: config.operation,
          stdout: sanitizeGitOutput(result.stdout),
          stderr: sanitizeGitOutput(result.stderr),
          command: {
            command: "git",
            args: args.map(sanitizeGitOutput),
          },
          durationMs: result.durationMs,
          outputTruncated: result.truncated,
        },
        metadata: {
          adapter: "cli",
          command: "git",
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          truncated: result.truncated,
        },
      };
    },
  };
}

export function createGitCloneTool(
  runCommand: GitCliCommandRunner = executeCliCommand,
): ToolDefinition<GitCloneInput, GitMutatingResult> {
  return createGitMutatingTool(
    {
      name: "git.clone",
      operation: "clone",
      description:
        "Clone a Git repository using git clone through Orqent's controlled CLI adapter. Mutates the filesystem and may use network access. Requires confirmation.",
      inputSchema: {
        type: "object",
        properties: {
          repositoryUrl: {
            type: "string",
            description:
              "Repository URL to clone. Must not contain embedded HTTP credentials.",
          },
          directory: {
            type: "string",
            description:
              "Optional target directory relative to the current working directory.",
          },
          branch: {
            type: "string",
            description:
              "Optional branch or tag to checkout during clone.",
          },
          depth: {
            type: "number",
            description:
              "Optional shallow clone depth.",
          },
          singleBranch: {
            type: "boolean",
            description:
              "When true, pass --single-branch.",
          },
        },
        required: [ "repositoryUrl" ],
        additionalProperties: false,
      },
      validateInput: validateGitCloneInput,
      buildArgs: buildGitCloneArgs,
    },
    runCommand,
  );
}

export function createGitFetchTool(
  runCommand: GitCliCommandRunner = executeCliCommand,
): ToolDefinition<GitFetchInput, GitMutatingResult> {
  return createGitMutatingTool(
    {
      name: "git.fetch",
      operation: "fetch",
      description:
        "Fetch Git refs using git fetch through Orqent's controlled CLI adapter. Updates local Git metadata and may use network access. Requires confirmation.",
      inputSchema: {
        type: "object",
        properties: {
          remote: {
            type: "string",
            description:
              "Optional remote name. Defaults to Git's configured default.",
          },
          refspec: {
            type: "string",
            description:
              "Optional refspec to fetch.",
          },
          prune: {
            type: "boolean",
            description:
              "When true, pass --prune.",
          },
          tags: {
            type: "boolean",
            description:
              "When true, pass --tags.",
          },
        },
        additionalProperties: false,
      },
      validateInput: validateGitFetchInput,
      buildArgs: buildGitFetchArgs,
    },
    runCommand,
  );
}

export function createGitPullTool(
  runCommand: GitCliCommandRunner = executeCliCommand,
): ToolDefinition<GitPullInput, GitMutatingResult> {
  return createGitMutatingTool(
    {
      name: "git.pull",
      operation: "pull",
      description:
        "Pull Git changes using git pull through Orqent's controlled CLI adapter. Mutates the working tree and may use network access. Defaults to --ff-only. Requires confirmation.",
      inputSchema: {
        type: "object",
        properties: {
          remote: {
            type: "string",
            description:
              "Optional remote name. Defaults to Git's configured default.",
          },
          branch: {
            type: "string",
            description:
              "Optional branch/ref to pull.",
          },
          rebase: {
            type: "boolean",
            description:
              "When true, pass --rebase. Defaults to false.",
          },
          ffOnly: {
            type: "boolean",
            description:
              "When true, pass --ff-only unless rebase=true. Defaults to true.",
          },
        },
        additionalProperties: false,
      },
      validateInput: validateGitPullInput,
      buildArgs: buildGitPullArgs,
    },
    runCommand,
  );
}

export function createGitCheckoutTool(
  runCommand: GitCliCommandRunner = executeCliCommand,
): ToolDefinition<GitCheckoutInput, GitMutatingResult> {
  return createGitMutatingTool(
    {
      name: "git.checkout",
      operation: "checkout",
      description:
        "Checkout a Git branch, commit, or tag using git checkout through Orqent's controlled CLI adapter. Mutates HEAD and may modify the working tree. Requires confirmation.",
      inputSchema: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description:
              "Branch, commit, or tag to checkout. Must not start with '-'.",
          },
          createBranch: {
            type: "string",
            description:
              "Optional new branch name. When provided, runs git checkout -b <createBranch> <target>.",
          },
          detach: {
            type: "boolean",
            description:
              "When true, runs git checkout --detach <target>.",
          },
        },
        required: [ "target" ],
        additionalProperties: false,
      },
      validateInput: validateGitCheckoutInput,
      buildArgs: buildGitCheckoutArgs,
    },
    runCommand,
  );
}

export function createGitSwitchTool(
  runCommand: GitCliCommandRunner = executeCliCommand,
): ToolDefinition<GitSwitchInput, GitMutatingResult> {
  return createGitMutatingTool(
    {
      name: "git.switch",
      operation: "switch",
      description:
        "Switch Git branches using git switch through Orqent's controlled CLI adapter. Mutates HEAD and may modify the working tree. Requires confirmation.",
      inputSchema: {
        type: "object",
        properties: {
          branch: {
            type: "string",
            description:
              "Branch name to switch to. Must not start with '-'.",
          },
          create: {
            type: "boolean",
            description:
              "When true, pass --create.",
          },
          track: {
            type: "boolean",
            description:
              "When true, pass --track.",
          },
        },
        required: [ "branch" ],
        additionalProperties: false,
      },
      validateInput: validateGitSwitchInput,
      buildArgs: buildGitSwitchArgs,
    },
    runCommand,
  );
}

export function createGitAddTool(
  runCommand: GitCliCommandRunner = executeCliCommand,
): ToolDefinition<GitAddInput, GitMutatingResult> {
  return createGitMutatingTool(
    {
      name: "git.add",
      operation: "add",
      description:
        "Stage files using git add through Orqent's controlled CLI adapter. Mutates the Git index. Requires confirmation.",
      inputSchema: {
        type: "object",
        properties: {
          paths: {
            type: "array",
            items: {
              type: "string",
            },
            description:
              "Paths to stage. Use [\".\"] to stage the current directory.",
          },
        },
        required: [ "paths" ],
        additionalProperties: false,
      },
      validateInput: validateGitAddInput,
      buildArgs: buildGitAddArgs,
    },
    runCommand,
  );
}

export function createGitCommitTool(
  runCommand: GitCliCommandRunner = executeCliCommand,
): ToolDefinition<GitCommitInput, GitMutatingResult> {
  return createGitMutatingTool(
    {
      name: "git.commit",
      operation: "commit",
      description:
        "Create a Git commit using git commit -m through Orqent's controlled CLI adapter. Mutates repository history locally. Requires confirmation.",
      inputSchema: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description:
              "Commit message. Can contain multiple lines.",
          },
          allowEmpty: {
            type: "boolean",
            description:
              "When true, pass --allow-empty.",
          },
        },
        required: [ "message" ],
        additionalProperties: false,
      },
      validateInput: validateGitCommitInput,
      buildArgs: buildGitCommitArgs,
    },
    runCommand,
  );
}

export function createGitPushTool(
  runCommand: GitCliCommandRunner = executeCliCommand,
): ToolDefinition<GitPushInput, GitMutatingResult> {
  return createGitMutatingTool(
    {
      name: "git.push",
      operation: "push",
      description:
        "Push Git commits using git push through Orqent's controlled CLI adapter. Uses network access and mutates remote repository state. Requires confirmation. Supports --force-with-lease but intentionally does not expose raw --force.",
      inputSchema: {
        type: "object",
        properties: {
          remote: {
            type: "string",
            description:
              "Optional remote name, for example origin. Required when branch is provided.",
          },
          branch: {
            type: "string",
            description:
              "Optional branch/ref to push. Requires remote when provided.",
          },
          setUpstream: {
            type: "boolean",
            description:
              "When true, pass --set-upstream. Requires both remote and branch.",
          },
          forceWithLease: {
            type: "boolean",
            description:
              "When true, pass --force-with-lease. Raw --force is intentionally unsupported.",
          },
        },
        additionalProperties: false,
      },
      validateInput: validateGitPushInput,
      buildArgs: buildGitPushArgs,
    },
    runCommand,
  );
}

export const gitStatusTool = createGitStatusTool();
export const gitDiffTool = createGitDiffTool();
export const gitLogTool = createGitLogTool();
export const gitBranchTool = createGitBranchTool();
export const gitShowTool = createGitShowTool();
export const gitRemotesTool = createGitRemotesTool();
export const gitCloneTool = createGitCloneTool();
export const gitFetchTool = createGitFetchTool();
export const gitPullTool = createGitPullTool();
export const gitCheckoutTool = createGitCheckoutTool();
export const gitSwitchTool = createGitSwitchTool();
export const gitAddTool = createGitAddTool();
export const gitCommitTool = createGitCommitTool();
export const gitPushTool = createGitPushTool();