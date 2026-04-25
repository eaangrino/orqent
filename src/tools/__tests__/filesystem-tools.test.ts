import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createToolRegistry } from "../registry.js";
import { executeTool } from "../router.js";
import type { ToolExecutionResult } from "../types.js";
import {
  filesystemListTool,
  filesystemReadTool,
  filesystemWriteTool,
  projectSearchTool,
  type FileSystemListResult,
  type FileSystemReadResult,
  type FileSystemWriteResult,
  type ProjectSearchResult,
} from "../builtin/filesystem.js";

let tempDir = "";

function expectOkResult<TResult>(
  result: ToolExecutionResult,
): asserts result is {
  ok: true;
  result: TResult;
  metadata?: Record<string, unknown>;
} {
  expect(result.ok).toBe(true);
}

function expectErrorResult(
  result: ToolExecutionResult,
): asserts result is {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: Record<string, unknown>;
} {
  expect(result.ok).toBe(false);
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "orqent-tools-test-"));
});

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, {
      recursive: true,
      force: true,
    });
    tempDir = "";
  }
});

describe("filesystem tools", () => {
  it("filesystem.list lista entradas visibles del directorio", async () => {
    await writeFile(join(tempDir, "visible.txt"), "visible", "utf8");
    await writeFile(join(tempDir, ".hidden.txt"), "hidden", "utf8");

    const registry = createToolRegistry([filesystemListTool]);

    const result = await executeTool({
      registry,
      toolName: "filesystem.list",
      input: {
        path: ".",
      },
      sessionId: "session-test",
      cwd: tempDir,
    });

    expectOkResult<FileSystemListResult>(result);

    expect(result.result.entries.map((entry) => entry.name)).toContain(
      "visible.txt",
    );
    expect(result.result.entries.map((entry) => entry.name)).not.toContain(
      ".hidden.txt",
    );
    expect(result.result.truncated).toBe(false);
  });

  it("filesystem.read lee un archivo y respeta maxBytes", async () => {
    await writeFile(join(tempDir, "readme.txt"), "abcdef", "utf8");

    const registry = createToolRegistry([filesystemReadTool]);

    const result = await executeTool({
      registry,
      toolName: "filesystem.read",
      input: {
        path: "readme.txt",
        maxBytes: 3,
      },
      sessionId: "session-test",
      cwd: tempDir,
    });

    expectOkResult<FileSystemReadResult>(result);

    expect(result.result.content).toBe("abc");
    expect(result.result.sizeBytes).toBe(6);
    expect(result.result.truncated).toBe(true);
  });

  it("filesystem.write queda bloqueada sin confirmación", async () => {
    const registry = createToolRegistry([filesystemWriteTool]);

    const result = await executeTool({
      registry,
      toolName: "filesystem.write",
      input: {
        path: "blocked.txt",
        content: "no escribir",
      },
      sessionId: "session-test",
      cwd: tempDir,
    });

    expectErrorResult(result);

    expect(result.error.code).toBe("tool_confirmation_required");
  });

  it("filesystem.write escribe archivo cuando hay confirmación", async () => {
    const registry = createToolRegistry([filesystemWriteTool]);

    const result = await executeTool({
      registry,
      toolName: "filesystem.write",
      input: {
        path: "nested/output.txt",
        content: "contenido escrito",
        createDirectories: true,
      },
      sessionId: "session-test",
      cwd: tempDir,
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expectOkResult<FileSystemWriteResult>(result);

    expect(result.result.created).toBe(true);
    expect(result.result.overwritten).toBe(false);
    expect(result.result.bytesWritten).toBe(
      Buffer.byteLength("contenido escrito", "utf8"),
    );

    await expect(readFile(join(tempDir, "nested/output.txt"), "utf8")).resolves.toBe(
      "contenido escrito",
    );
  });

  it("filesystem.write rechaza sobrescritura sin overwrite=true", async () => {
    await writeFile(join(tempDir, "existing.txt"), "original", "utf8");

    const registry = createToolRegistry([filesystemWriteTool]);

    const result = await executeTool({
      registry,
      toolName: "filesystem.write",
      input: {
        path: "existing.txt",
        content: "nuevo",
      },
      sessionId: "session-test",
      cwd: tempDir,
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expectErrorResult(result);

    expect(result.error.code).toBe("filesystem_write_refused_existing_file");
    await expect(readFile(join(tempDir, "existing.txt"), "utf8")).resolves.toBe(
      "original",
    );
  });

  it("project.search encuentra coincidencias case-insensitive", async () => {
    await writeFile(
      join(tempDir, "source.ts"),
      "const message = 'Hola Orqent';\nconst other = true;\n",
      "utf8",
    );
    await writeFile(join(tempDir, "ignored.txt"), "sin match", "utf8");

    const registry = createToolRegistry([projectSearchTool]);

    const result = await executeTool({
      registry,
      toolName: "project.search",
      input: {
        query: "orqent",
        path: ".",
      },
      sessionId: "session-test",
      cwd: tempDir,
    });

    expectOkResult<ProjectSearchResult>(result);

    expect(result.result.scannedFiles).toBeGreaterThanOrEqual(1);
    expect(result.result.matches).toHaveLength(1);
    expect(result.result.matches[0]?.relativePath).toBe("source.ts");
    expect(result.result.matches[0]?.line).toBe(1);
    expect(result.result.matches[0]?.preview).toContain("Hola Orqent");
  });
});
