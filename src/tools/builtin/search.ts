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

export type SearchRgInput = {
  query: string;
  path: string | null;
  caseSensitive: boolean;
  fixedStrings: boolean;
  includeHidden: boolean;
  globs: string[];
  maxResults: number;
};

export type SearchRgSubmatch = {
  text: string;
  start: number;
  end: number;
};

export type SearchRgMatch = {
  path: string;
  lineNumber: number;
  column: number | null;
  line: string;
  matchText: string | null;
  submatches: SearchRgSubmatch[];
  raw: Record<string, unknown>;
};

export type SearchRgResult = {
  cwd: string;
  query: string;
  path: string | null;
  caseSensitive: boolean;
  fixedStrings: boolean;
  includeHidden: boolean;
  globs: string[];
  maxResults: number;
  count: number;
  matches: SearchRgMatch[];
  command: {
    command: string;
    args: string[];
  };
  durationMs: number;
  outputTruncated: boolean;
};

export type SearchFindKind = "any" | "file" | "directory";

export type SearchFindInput = {
  path: string | null;
  name: string | null;
  kind: SearchFindKind;
  includeHidden: boolean;
  maxDepth: number | null;
  maxResults: number;
};

export type SearchFindEntry = {
  path: string;
};

export type SearchFindResult = {
  cwd: string;
  path: string | null;
  name: string | null;
  kind: SearchFindKind;
  includeHidden: boolean;
  maxDepth: number | null;
  maxResults: number;
  count: number;
  entries: SearchFindEntry[];
  command: {
    command: string;
    args: string[];
  };
  durationMs: number;
  outputTruncated: boolean;
};

export type SearchCliCommandRunner = (
  input: CliCommandAdapterInput,
) => Promise<CliCommandAdapterResult>;

const SEARCH_RG_TIMEOUT_MS = 10_000;
const SEARCH_RG_MAX_OUTPUT_CHARS = 256_000;

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

function normalizeRequiredString(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const normalized = value.trim();

  if (/[\r\n]/.test(normalized)) {
    return null;
  }

  return normalized;
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

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item) => !/[\r\n]/.test(item)),
    ),
  );
}

function validateSearchRgInput(
  input: unknown,
): ToolValidationResult<SearchRgInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Input must be an object.",
    };
  }

  const query = normalizeRequiredString(input.query);

  if (!query) {
    return {
      ok: false,
      error: "query must be a non-empty string without line breaks.",
    };
  }

  return {
    ok: true,
    input: {
      query,
      path: normalizeNullablePath(input.path),
      caseSensitive: normalizeBoolean(input.caseSensitive, false),
      fixedStrings: normalizeBoolean(input.fixedStrings, false),
      includeHidden: normalizeBoolean(input.includeHidden, false),
      globs: normalizeStringList(input.globs),
      maxResults: normalizePositiveInteger(input.maxResults, 100, 1000),
    },
  };
}

function buildSearchRgArgs(input: SearchRgInput): string[] {
  const args = [
    "--json",
    "--line-number",
    "--column",
    "--color",
    "never",
  ];

  if (!input.caseSensitive) {
    args.push("--ignore-case");
  }

  if (input.fixedStrings) {
    args.push("--fixed-strings");
  }

  if (input.includeHidden) {
    args.push("--hidden");
  }

  for (const glob of input.globs) {
    args.push("--glob", glob);
  }

  args.push("--", input.query);

  if (input.path) {
    args.push(input.path);
  }

  return args;
}

function getTextField(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  return typeof value.text === "string" ? value.text : null;
}

function parseSubmatches(value: unknown): SearchRgSubmatch[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const text = getTextField(item.match);

    if (
      text === null ||
      typeof item.start !== "number" ||
      typeof item.end !== "number"
    ) {
      return [];
    }

    return [
      {
        text,
        start: item.start,
        end: item.end,
      },
    ];
  });
}

function parseSearchRgOutput(stdout: string): SearchRgMatch[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as unknown;

        if (!isRecord(parsed) || parsed.type !== "match") {
          return [];
        }

        const data = parsed.data;

        if (!isRecord(data)) {
          return [];
        }

        const path = getTextField(data.path);
        const lineText = getTextField(data.lines);
        const submatches = parseSubmatches(data.submatches);

        if (
          !path ||
          lineText === null ||
          typeof data.line_number !== "number"
        ) {
          return [];
        }

        const firstSubmatch = submatches[ 0 ] ?? null;

        return [
          {
            path,
            lineNumber: data.line_number,
            column: firstSubmatch ? firstSubmatch.start + 1 : null,
            line: lineText.replace(/\n$/, ""),
            matchText: firstSubmatch?.text ?? null,
            submatches,
            raw: parsed,
          },
        ];
      } catch {
        return [];
      }
    });
}

function createSearchRgError(
  result: CliCommandAdapterResult,
): ToolExecutionResult<SearchRgResult> {
  if (result.timedOut) {
    return {
      ok: false,
      error: {
        code: "search_rg_timed_out",
        message: "rg search timed out.",
        details: result,
      },
      metadata: {
        adapter: "cli",
        command: "rg",
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        truncated: result.truncated,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "search_rg_failed",
      message:
        result.stderr.trim() ||
        `rg search failed with exit code ${String(result.exitCode)}.`,
      details: result,
    },
    metadata: {
      adapter: "cli",
      command: "rg",
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      truncated: result.truncated,
    },
  };
}

function normalizeSearchFindKind(value: unknown): SearchFindKind {
  if (value === "file" || value === "directory") {
    return value;
  }

  return "any";
}

function normalizeNullablePositiveInteger(
  value: unknown,
  max: number,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.min(max, Math.max(1, Math.round(value)));
}

function validateSearchFindInput(
  input: unknown,
): ToolValidationResult<SearchFindInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Input must be an object.",
    };
  }

  const path = normalizeNullablePath(input.path);
  const name = normalizeNullablePath(input.name);

  return {
    ok: true,
    input: {
      path,
      name,
      kind: normalizeSearchFindKind(input.kind),
      includeHidden: normalizeBoolean(input.includeHidden, false),
      maxDepth: normalizeNullablePositiveInteger(input.maxDepth, 50),
      maxResults: normalizePositiveInteger(input.maxResults, 100, 1000),
    },
  };
}

function buildSearchFindArgs(input: SearchFindInput): string[] {
  const args = [ input.path ?? "." ];

  if (input.maxDepth !== null) {
    args.push("-maxdepth", String(input.maxDepth));
  }

  if (!input.includeHidden) {
    args.push(
      "-not",
      "-path",
      "*/.*",
    );
  }

  if (input.kind === "file") {
    args.push("-type", "f");
  }

  if (input.kind === "directory") {
    args.push("-type", "d");
  }

  if (input.name) {
    args.push("-name", input.name);
  }

  args.push("-print");

  return args;
}

function parseSearchFindOutput(stdout: string): SearchFindEntry[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((path) => ({
      path,
    }));
}

function createSearchFindError(
  result: CliCommandAdapterResult,
): ToolExecutionResult<SearchFindResult> {
  if (result.timedOut) {
    return {
      ok: false,
      error: {
        code: "search_find_timed_out",
        message: "find search timed out.",
        details: result,
      },
      metadata: {
        adapter: "cli",
        command: "find",
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        truncated: result.truncated,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "search_find_failed",
      message:
        result.stderr.trim() ||
        `find search failed with exit code ${String(result.exitCode)}.`,
      details: result,
    },
    metadata: {
      adapter: "cli",
      command: "find",
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      truncated: result.truncated,
    },
  };
}

export function createSearchFindTool(
  runCommand: SearchCliCommandRunner = executeCliCommand,
): ToolDefinition<SearchFindInput, SearchFindResult> {
  return {
    name: "search.find",
    description:
      "Find local files or directories using find through Orqent's controlled CLI adapter. Read-only. Does not execute arbitrary find expressions.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Optional root path to search. Defaults to current working directory.",
        },
        name: {
          type: "string",
          description:
            "Optional filename pattern for find -name. Must not contain line breaks.",
        },
        kind: {
          type: "string",
          enum: [ "any", "file", "directory" ],
          description:
            "Filter result kind. Defaults to any.",
        },
        includeHidden: {
          type: "boolean",
          description:
            "When true, include hidden files and directories.",
        },
        maxDepth: {
          type: "number",
          description:
            "Optional maximum directory depth. Capped at 50.",
        },
        maxResults: {
          type: "number",
          description:
            "Maximum number of paths to return from parsed output.",
        },
      },
      additionalProperties: false,
    },
    risk: "low",
    permissions: [ "shell:execute" ],
    requiresConfirmation: false,
    isReadOnly: true,
    timeoutMs: SEARCH_RG_TIMEOUT_MS,
    retry: {
      maxAttempts: 1,
      delayMs: 0,
    },
    validateInput: validateSearchFindInput,
    async execute(input, context) {
      const args = buildSearchFindArgs(input);

      const result = await runCommand({
        command: "find",
        args,
        cwd: context.cwd,
        timeoutMs: SEARCH_RG_TIMEOUT_MS,
        maxOutputChars: SEARCH_RG_MAX_OUTPUT_CHARS,
        signal: context.signal,
      });

      if (result.exitCode !== 0) {
        return createSearchFindError(result);
      }

      const entries = parseSearchFindOutput(result.stdout).slice(
        0,
        input.maxResults,
      );

      return {
        ok: true,
        result: {
          cwd: context.cwd,
          path: input.path,
          name: input.name,
          kind: input.kind,
          includeHidden: input.includeHidden,
          maxDepth: input.maxDepth,
          maxResults: input.maxResults,
          count: entries.length,
          entries,
          command: {
            command: "find",
            args,
          },
          durationMs: result.durationMs,
          outputTruncated: result.truncated,
        },
        metadata: {
          adapter: "cli",
          command: "find",
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          truncated: result.truncated,
        },
      };
    },
  };
}

export function createSearchRgTool(
  runCommand: SearchCliCommandRunner = executeCliCommand,
): ToolDefinition<SearchRgInput, SearchRgResult> {
  return {
    name: "search.rg",
    description:
      "Search local files using ripgrep through Orqent's controlled CLI adapter. Read-only. Does not execute arbitrary search commands.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search query or pattern. Must not contain line breaks.",
        },
        path: {
          type: "string",
          description:
            "Optional path to search in. Defaults to current working directory.",
        },
        caseSensitive: {
          type: "boolean",
          description:
            "When true, search is case-sensitive. Defaults to false.",
        },
        fixedStrings: {
          type: "boolean",
          description:
            "When true, treat query as a literal string instead of a regex.",
        },
        includeHidden: {
          type: "boolean",
          description:
            "When true, include hidden files and directories.",
        },
        globs: {
          type: "array",
          items: {
            type: "string",
          },
          description:
            "Optional ripgrep glob filters, for example **/*.ts or !node_modules/**.",
        },
        maxResults: {
          type: "number",
          description:
            "Maximum number of matches to return from parsed output.",
        },
      },
      required: [ "query" ],
      additionalProperties: false,
    },
    risk: "low",
    permissions: [ "shell:execute" ],
    requiresConfirmation: false,
    isReadOnly: true,
    timeoutMs: SEARCH_RG_TIMEOUT_MS,
    retry: {
      maxAttempts: 1,
      delayMs: 0,
    },
    validateInput: validateSearchRgInput,
    async execute(input, context) {
      const args = buildSearchRgArgs(input);

      const result = await runCommand({
        command: "rg",
        args,
        cwd: context.cwd,
        timeoutMs: SEARCH_RG_TIMEOUT_MS,
        maxOutputChars: SEARCH_RG_MAX_OUTPUT_CHARS,
        signal: context.signal,
      });

      if (result.exitCode !== 0 && result.exitCode !== 1) {
        return createSearchRgError(result);
      }

      const matches =
        result.exitCode === 1
          ? []
          : parseSearchRgOutput(result.stdout).slice(0, input.maxResults);

      return {
        ok: true,
        result: {
          cwd: context.cwd,
          query: input.query,
          path: input.path,
          caseSensitive: input.caseSensitive,
          fixedStrings: input.fixedStrings,
          includeHidden: input.includeHidden,
          globs: input.globs,
          maxResults: input.maxResults,
          count: matches.length,
          matches,
          command: {
            command: "rg",
            args,
          },
          durationMs: result.durationMs,
          outputTruncated: result.truncated,
        },
        metadata: {
          adapter: "cli",
          command: "rg",
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          truncated: result.truncated,
        },
      };
    },
  };
}

export const searchRgTool = createSearchRgTool();
export const searchFindTool = createSearchFindTool();