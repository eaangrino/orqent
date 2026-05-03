import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import { Dirent } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolValidationResult,
} from "../types.js";

export type FileSystemListInput = {
  path?: string;
  includeHidden: boolean;
  maxEntries: number;
};

export type FileSystemEntryType = "file" | "directory" | "symlink" | "other";

export type FileSystemListEntry = {
  name: string;
  path: string;
  relativePath: string;
  type: FileSystemEntryType;
  sizeBytes: number;
  modifiedAt: string;
};

export type FileSystemListResult = {
  cwd: string;
  requestedPath: string;
  resolvedPath: string;
  entries: FileSystemListEntry[];
  totalEntries: number;
  truncated: boolean;
};

export type FileSystemReadInput = {
  path: string;
  maxBytes: number;
};

export type FileSystemReadResult = {
  cwd: string;
  requestedPath: string;
  resolvedPath: string;
  sizeBytes: number;
  content: string;
  truncated: boolean;
};

export type FileSystemWriteInput = {
  path: string;
  content: string;
  overwrite: boolean;
  createDirectories: boolean;
};

export type FileSystemWriteResult = {
  cwd: string;
  requestedPath: string;
  resolvedPath: string;
  bytesWritten: number;
  created: boolean;
  overwritten: boolean;
};

export type ProjectSearchInput = {
  query: string;
  path?: string;
  includeHidden: boolean;
  maxFiles: number;
  maxMatches: number;
};

export type ProjectSearchMatch = {
  path: string;
  relativePath: string;
  line: number;
  column: number;
  preview: string;
};

export type ProjectSearchResult = {
  cwd: string;
  query: string;
  searchRoot: string;
  scannedFiles: number;
  matches: ProjectSearchMatch[];
  truncated: boolean;
};

const DEFAULT_MAX_ENTRIES = 200;
const MAX_ENTRIES_LIMIT = 1_000;

function isPathInsideCwd(cwd: string, targetPath: string): boolean {
  const relativePath = relative(cwd, targetPath);

  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

function createFilesystemSandboxError(
  requestedPath: string,
  resolvedPath: string,
): ToolExecutionResult {
  return {
    ok: false,
    error: {
      code: "filesystem_path_outside_cwd",
      message: `Path "${requestedPath}" resolves outside the current working directory.`,
      details: {
        requestedPath,
        resolvedPath,
      },
    },
  };
}

async function resolvePathInsideCwd(
  context: ToolExecutionContext,
  requestedPath: string,
): Promise<
  | {
    ok: true;
    path: string;
  }
  | {
    ok: false;
    result: ToolExecutionResult;
  }
> {
  const cwdRealPath = await realpath(context.cwd);
  const targetPath = resolve(cwdRealPath, requestedPath);
  const resolvedPath = await realpath(targetPath);

  if (!isPathInsideCwd(cwdRealPath, resolvedPath)) {
    return {
      ok: false,
      result: createFilesystemSandboxError(requestedPath, resolvedPath),
    };
  }

  return {
    ok: true,
    path: resolvedPath,
  };
}

async function resolveWritablePathInsideCwd(
  context: ToolExecutionContext,
  requestedPath: string,
): Promise<
  | {
    ok: true;
    path: string;
    parentPath: string;
  }
  | {
    ok: false;
    result: ToolExecutionResult;
  }
> {
  const cwdRealPath = await realpath(context.cwd);
  const targetPath = resolve(cwdRealPath, requestedPath);

  if (!isPathInsideCwd(cwdRealPath, targetPath)) {
    return {
      ok: false,
      result: createFilesystemSandboxError(requestedPath, targetPath),
    };
  }

  const parentPath = dirname(targetPath);
  let nearestExistingParent = parentPath;

  while (true) {
    try {
      await lstat(nearestExistingParent);
      break;
    } catch (error) {
      if (!isNodeError(error) || error.code !== "ENOENT") {
        throw error;
      }

      const nextParent = dirname(nearestExistingParent);

      if (nextParent === nearestExistingParent) {
        break;
      }

      nearestExistingParent = nextParent;
    }
  }

  const nearestExistingParentRealPath = await realpath(nearestExistingParent);

  if (!isPathInsideCwd(cwdRealPath, nearestExistingParentRealPath)) {
    return {
      ok: false,
      result: createFilesystemSandboxError(
        requestedPath,
        nearestExistingParentRealPath,
      ),
    };
  }

  return {
    ok: true,
    path: targetPath,
    parentPath,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeMaxEntries(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_MAX_ENTRIES;
  }

  return Math.min(MAX_ENTRIES_LIMIT, Math.max(1, Math.round(value)));
}

function toEntryType(stats: Awaited<ReturnType<typeof lstat>>): FileSystemEntryType {
  if (stats.isSymbolicLink()) {
    return "symlink";
  }

  if (stats.isDirectory()) {
    return "directory";
  }

  if (stats.isFile()) {
    return "file";
  }

  return "other";
}

function validateFileSystemListInput(
  input: unknown,
): ToolValidationResult<FileSystemListInput> {
  if (input === undefined || input === null) {
    return {
      ok: true,
      input: {
        includeHidden: false,
        maxEntries: DEFAULT_MAX_ENTRIES,
      },
    };
  }

  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Filesystem list input must be an object.",
    };
  }

  if (input.path !== undefined && typeof input.path !== "string") {
    return {
      ok: false,
      error: "Filesystem list path must be a string when provided.",
    };
  }

  return {
    ok: true,
    input: {
      path: input.path?.trim() || undefined,
      includeHidden: normalizeBoolean(input.includeHidden, false),
      maxEntries: normalizeMaxEntries(input.maxEntries),
    },
  };
}

async function listDirectory(
  input: FileSystemListInput,
  context: ToolExecutionContext,
): Promise<ToolExecutionResult<FileSystemListResult>> {
  const requestedPath = input.path ?? ".";

  try {
    const sandboxPath = await resolvePathInsideCwd(context, requestedPath);

    if (!sandboxPath.ok) {
      return sandboxPath.result as ToolExecutionResult<FileSystemListResult>;
    }

    const resolvedPath = sandboxPath.path;
    const targetStats = await lstat(resolvedPath);

    if (!targetStats.isDirectory()) {
      return {
        ok: false,
        error: {
          code: "filesystem_not_directory",
          message: `Path "${requestedPath}" is not a directory.`,
          details: {
            requestedPath,
            resolvedPath,
          },
        },
      };
    }

    const dirents = await readdir(resolvedPath, {
      withFileTypes: true,
    });

    const visibleDirents = input.includeHidden
      ? dirents
      : dirents.filter((dirent) => !dirent.name.startsWith("."));

    const limitedDirents = visibleDirents.slice(0, input.maxEntries);

    const entries = await Promise.all(
      limitedDirents.map(async (dirent): Promise<FileSystemListEntry> => {
        const entryPath = resolve(resolvedPath, dirent.name);
        const stats = await lstat(entryPath);

        return {
          name: basename(entryPath),
          path: entryPath,
          relativePath: relative(context.cwd, entryPath) || ".",
          type: toEntryType(stats),
          sizeBytes: stats.size,
          modifiedAt: stats.mtime.toISOString(),
        };
      }),
    );

    return {
      ok: true,
      result: {
        cwd: context.cwd,
        requestedPath,
        resolvedPath,
        entries,
        totalEntries: visibleDirents.length,
        truncated: visibleDirents.length > limitedDirents.length,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "filesystem_list_failed",
        message:
          error instanceof Error
            ? error.message
            : "Unknown filesystem list error.",
        details: error,
      },
    };
  }
}

const DEFAULT_MAX_READ_BYTES = 64_000;
const MAX_READ_BYTES_LIMIT = 512_000;

function normalizeMaxBytes(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_MAX_READ_BYTES;
  }

  return Math.min(MAX_READ_BYTES_LIMIT, Math.max(1, Math.round(value)));
}

function validateFileSystemReadInput(
  input: unknown,
): ToolValidationResult<FileSystemReadInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Filesystem read input must be an object.",
    };
  }

  if (typeof input.path !== "string" || !input.path.trim()) {
    return {
      ok: false,
      error: "Filesystem read requires a non-empty path string.",
    };
  }

  return {
    ok: true,
    input: {
      path: input.path.trim(),
      maxBytes: normalizeMaxBytes(input.maxBytes),
    },
  };
}

async function readFilesystemFile(
  input: FileSystemReadInput,
  context: ToolExecutionContext,
): Promise<ToolExecutionResult<FileSystemReadResult>> {
  const requestedPath = input.path;

  try {
    const sandboxPath = await resolvePathInsideCwd(context, requestedPath);

    if (!sandboxPath.ok) {
      return sandboxPath.result as ToolExecutionResult<FileSystemReadResult>;
    }

    const resolvedPath = sandboxPath.path;
    const stats = await lstat(resolvedPath);

    if (!stats.isFile()) {
      return {
        ok: false,
        error: {
          code: "filesystem_not_file",
          message: `Path "${requestedPath}" is not a file.`,
          details: {
            requestedPath,
            resolvedPath,
          },
        },
      };
    }

    const raw = await readFile(resolvedPath);
    const truncated = raw.length > input.maxBytes;
    const selected = truncated ? raw.subarray(0, input.maxBytes) : raw;

    return {
      ok: true,
      result: {
        cwd: context.cwd,
        requestedPath,
        resolvedPath,
        sizeBytes: raw.length,
        content: selected.toString("utf8"),
        truncated,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "filesystem_read_failed",
        message:
          error instanceof Error
            ? error.message
            : "Unknown filesystem read error.",
        details: error,
      },
    };
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

function validateFileSystemWriteInput(
  input: unknown,
): ToolValidationResult<FileSystemWriteInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Filesystem write input must be an object.",
    };
  }

  if (typeof input.path !== "string" || !input.path.trim()) {
    return {
      ok: false,
      error: "Filesystem write requires a non-empty path string.",
    };
  }

  if (typeof input.content !== "string") {
    return {
      ok: false,
      error: "Filesystem write requires content as a string.",
    };
  }

  return {
    ok: true,
    input: {
      path: input.path.trim(),
      content: input.content,
      overwrite: normalizeBoolean(input.overwrite, false),
      createDirectories: normalizeBoolean(input.createDirectories, false),
    },
  };
}

async function writeFilesystemFile(
  input: FileSystemWriteInput,
  context: ToolExecutionContext,
): Promise<ToolExecutionResult<FileSystemWriteResult>> {
  const requestedPath = input.path;

  try {
    const sandboxPath = await resolveWritablePathInsideCwd(
      context,
      requestedPath,
    );

    if (!sandboxPath.ok) {
      return sandboxPath.result as ToolExecutionResult<FileSystemWriteResult>;
    }

    const targetPath = sandboxPath.path;
    const parentPath = sandboxPath.parentPath;
    let fileExists = false;

    try {
      const existingStats = await lstat(targetPath);

      if (!existingStats.isFile()) {
        return {
          ok: false,
          error: {
            code: "filesystem_not_file",
            message: `Path "${requestedPath}" exists but is not a file.`,
            details: {
              requestedPath,
              resolvedPath: targetPath,
            },
          },
        };
      }

      fileExists = true;
    } catch (error) {
      if (!isNodeError(error) || error.code !== "ENOENT") {
        return {
          ok: false,
          error: {
            code: "filesystem_write_stat_failed",
            message:
              error instanceof Error
                ? error.message
                : "Unknown filesystem stat error.",
            details: error,
          },
        };
      }
    }

    if (fileExists && !input.overwrite) {
      return {
        ok: false,
        error: {
          code: "filesystem_write_refused_existing_file",
          message:
            `Path "${requestedPath}" already exists. Set overwrite=true to replace it.`,
          details: {
            requestedPath,
            resolvedPath: targetPath,
          },
        },
      };
    }

    if (input.createDirectories) {
      await mkdir(parentPath, {
        recursive: true,
      });
    }

    await writeFile(targetPath, input.content, "utf8");

    const resolvedPath = await realpath(targetPath);
    const bytesWritten = Buffer.byteLength(input.content, "utf8");

    return {
      ok: true,
      result: {
        cwd: context.cwd,
        requestedPath,
        resolvedPath,
        bytesWritten,
        created: !fileExists,
        overwritten: fileExists,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "filesystem_write_failed",
        message:
          error instanceof Error
            ? error.message
            : "Unknown filesystem write error.",
        details: error,
      },
    };
  }
}

const DEFAULT_SEARCH_MAX_FILES = 1_000;
const DEFAULT_SEARCH_MAX_MATCHES = 100;
const MAX_SEARCH_FILE_BYTES = 512_000;

const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  "venv",
  ".venv",
]);

function normalizeSearchLimit(
  value: unknown,
  fallback: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(1, Math.round(value)));
}

function validateProjectSearchInput(
  input: unknown,
): ToolValidationResult<ProjectSearchInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "Project search input must be an object.",
    };
  }

  if (typeof input.query !== "string" || !input.query.trim()) {
    return {
      ok: false,
      error: "Project search requires a non-empty query string.",
    };
  }

  if (input.path !== undefined && typeof input.path !== "string") {
    return {
      ok: false,
      error: "Project search path must be a string when provided.",
    };
  }

  return {
    ok: true,
    input: {
      query: input.query,
      path: input.path?.trim() || undefined,
      includeHidden: normalizeBoolean(input.includeHidden, false),
      maxFiles: normalizeSearchLimit(input.maxFiles, DEFAULT_SEARCH_MAX_FILES, 10_000),
      maxMatches: normalizeSearchLimit(input.maxMatches, DEFAULT_SEARCH_MAX_MATCHES, 1_000),
    },
  };
}

function shouldSkipDirectory(dirent: Dirent, includeHidden: boolean): boolean {
  if (!dirent.isDirectory()) {
    return false;
  }

  if (!includeHidden && dirent.name.startsWith(".")) {
    return true;
  }

  return IGNORED_DIRECTORIES.has(dirent.name);
}

function shouldSkipFile(dirent: Dirent, includeHidden: boolean): boolean {
  if (!dirent.isFile()) {
    return true;
  }

  if (!includeHidden && dirent.name.startsWith(".")) {
    return true;
  }

  return false;
}

function findMatchesInContent({
  content,
  query,
  filePath,
  cwd,
  maxMatches,
}: {
  content: string;
  query: string;
  filePath: string;
  cwd: string;
  maxMatches: number;
}): ProjectSearchMatch[] {
  const matches: ProjectSearchMatch[] = [];
  const normalizedQuery = query.toLowerCase();
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index++) {
    const line = lines[ index ]!;
    const column = line.toLowerCase().indexOf(normalizedQuery);

    if (column === -1) {
      continue;
    }

    matches.push({
      path: filePath,
      relativePath: relative(cwd, filePath) || ".",
      line: index + 1,
      column: column + 1,
      preview: line.trim().slice(0, 300),
    });

    if (matches.length >= maxMatches) {
      break;
    }
  }

  return matches;
}

async function searchDirectoryRecursive({
  root,
  cwd,
  query,
  includeHidden,
  maxFiles,
  maxMatches,
}: {
  root: string;
  cwd: string;
  query: string;
  includeHidden: boolean;
  maxFiles: number;
  maxMatches: number;
}): Promise<{
  scannedFiles: number;
  matches: ProjectSearchMatch[];
  truncated: boolean;
}> {
  const pending = [ root ];
  const matches: ProjectSearchMatch[] = [];
  let scannedFiles = 0;
  let truncated = false;

  while (pending.length > 0) {
    if (scannedFiles >= maxFiles || matches.length >= maxMatches) {
      truncated = true;
      break;
    }

    const currentDir = pending.pop()!;
    const dirents = await readdir(currentDir, {
      withFileTypes: true,
    });

    for (const dirent of dirents) {
      if (scannedFiles >= maxFiles || matches.length >= maxMatches) {
        truncated = true;
        break;
      }

      const entryPath = resolve(currentDir, dirent.name);

      if (shouldSkipDirectory(dirent, includeHidden)) {
        continue;
      }

      if (dirent.isDirectory()) {
        pending.push(entryPath);
        continue;
      }

      if (shouldSkipFile(dirent, includeHidden)) {
        continue;
      }

      scannedFiles++;

      const stats = await lstat(entryPath);

      if (stats.size > MAX_SEARCH_FILE_BYTES) {
        continue;
      }

      const content = await readFile(entryPath, "utf8");
      const fileMatches = findMatchesInContent({
        content,
        query,
        filePath: entryPath,
        cwd,
        maxMatches: maxMatches - matches.length,
      });

      matches.push(...fileMatches);
    }
  }

  return {
    scannedFiles,
    matches,
    truncated,
  };
}

async function searchProject(
  input: ProjectSearchInput,
  context: ToolExecutionContext,
): Promise<ToolExecutionResult<ProjectSearchResult>> {
  const requestedPath = input.path ?? ".";

  try {
    const sandboxPath = await resolvePathInsideCwd(context, requestedPath);

    if (!sandboxPath.ok) {
      return sandboxPath.result as ToolExecutionResult<ProjectSearchResult>;
    }

    const searchRoot = sandboxPath.path;
    const stats = await lstat(searchRoot);

    if (!stats.isDirectory()) {
      return {
        ok: false,
        error: {
          code: "project_search_root_not_directory",
          message: `Search root "${requestedPath}" is not a directory.`,
          details: {
            requestedPath,
            searchRoot,
          },
        },
      };
    }

    const result = await searchDirectoryRecursive({
      root: searchRoot,
      cwd: context.cwd,
      query: input.query,
      includeHidden: input.includeHidden,
      maxFiles: input.maxFiles,
      maxMatches: input.maxMatches,
    });

    return {
      ok: true,
      result: {
        cwd: context.cwd,
        query: input.query,
        searchRoot,
        scannedFiles: result.scannedFiles,
        matches: result.matches,
        truncated: result.truncated,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "project_search_failed",
        message:
          error instanceof Error
            ? error.message
            : "Unknown project search error.",
        details: error,
      },
    };
  }
}

export const filesystemListTool: ToolDefinition<
  FileSystemListInput,
  FileSystemListResult
> = {
  name: "filesystem.list",
  description:
    "List files and directories from the local filesystem. Read-only.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "Directory path to list. Relative paths are resolved from the runtime cwd.",
      },
      includeHidden: {
        type: "boolean",
        description: "Whether to include dotfiles and hidden entries.",
      },
      maxEntries: {
        type: "number",
        description: "Maximum number of entries to return.",
      },
    },
    additionalProperties: false,
  },
  risk: "low",
  permissions: [ "filesystem:read" ],
  requiresConfirmation: false,
  isReadOnly: true,
  timeoutMs: 15_000,
  retry: {
    maxAttempts: 1,
    delayMs: 0,
  },
  validateInput: validateFileSystemListInput,
  execute: listDirectory,
};

export const filesystemReadTool: ToolDefinition<
  FileSystemReadInput,
  FileSystemReadResult
> = {
  name: "filesystem.read",
  description:
    "Read a local text file from the filesystem with a byte limit. Read-only.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "File path to read. Relative paths are resolved from the runtime cwd.",
      },
      maxBytes: {
        type: "number",
        description: "Maximum number of bytes to read.",
      },
    },
    required: [ "path" ],
    additionalProperties: false,
  },
  risk: "low",
  permissions: [ "filesystem:read" ],
  requiresConfirmation: false,
  isReadOnly: true,
  timeoutMs: 15_000,
  retry: {
    maxAttempts: 1,
    delayMs: 0,
  },
  validateInput: validateFileSystemReadInput,
  execute: readFilesystemFile,
};

export const filesystemWriteTool: ToolDefinition<
  FileSystemWriteInput,
  FileSystemWriteResult
> = {
  name: "filesystem.write",
  description:
    "Write a local text file to the filesystem. Requires explicit confirmation.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "File path to write. Relative paths are resolved from the runtime cwd.",
      },
      content: {
        type: "string",
        description: "Text content to write.",
      },
      overwrite: {
        type: "boolean",
        description: "Whether to overwrite an existing file.",
      },
      createDirectories: {
        type: "boolean",
        description: "Whether to create parent directories when missing.",
      },
    },
    required: [ "path", "content" ],
    additionalProperties: false,
  },
  risk: "high",
  permissions: [ "filesystem:write" ],
  requiresConfirmation: true,
  isReadOnly: false,
  timeoutMs: 15_000,
  retry: {
    maxAttempts: 1,
    delayMs: 0,
  },
  validateInput: validateFileSystemWriteInput,
  execute: writeFilesystemFile,
};

export const projectSearchTool: ToolDefinition<
  ProjectSearchInput,
  ProjectSearchResult
> = {
  name: "project.search",
  description:
    "Search for plain text matches inside the current project directory. Read-only.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Plain text query to search for. Case-insensitive.",
      },
      path: {
        type: "string",
        description:
          "Directory path to search in. Relative paths are resolved from the runtime cwd.",
      },
      includeHidden: {
        type: "boolean",
        description: "Whether to include dotfiles and hidden directories.",
      },
      maxFiles: {
        type: "number",
        description: "Maximum number of files to scan.",
      },
      maxMatches: {
        type: "number",
        description: "Maximum number of matches to return.",
      },
    },
    required: [ "query" ],
    additionalProperties: false,
  },
  risk: "low",
  permissions: [ "project:search", "filesystem:read" ],
  requiresConfirmation: false,
  isReadOnly: true,
  timeoutMs: 15_000,
  retry: {
    maxAttempts: 1,
    delayMs: 0,
  },
  validateInput: validateProjectSearchInput,
  execute: searchProject,
};