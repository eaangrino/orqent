import { describe, expect, it, vi } from "vitest";
import { createToolRegistry, executeTool } from "../index.js";
import {
  createSearchFindTool,
  createSearchRgTool,
  type SearchCliCommandRunner,
  type SearchFindResult,
  type SearchRgResult,
} from "../builtin/search.js";
import { defaultToolRegistry } from "../registry.js";

function createCliResult(
  overrides: Partial<Awaited<ReturnType<SearchCliCommandRunner>>> = {},
) {
  return {
    command: "rg",
    args: [ "--json" ],
    cwd: "/tmp/project",
    exitCode: 0,
    signal: null,
    stdout: "",
    stderr: "",
    durationMs: 12,
    timedOut: false,
    truncated: false,
    ...overrides,
  };
}

describe("search tools", () => {
  it("registra search.rg en el registry por defecto", () => {
    expect(defaultToolRegistry.has("search.rg")).toBe(true);
  });

  it("search.rg ejecuta rg mediante el adapter CLI controlado", async () => {
    const rgMatch = {
      type: "match",
      data: {
        path: {
          text: "src/app.tsx",
        },
        lines: {
          text: "const name = 'Orqent';\n",
        },
        line_number: 10,
        submatches: [
          {
            match: {
              text: "Orqent",
            },
            start: 14,
            end: 20,
          },
        ],
      },
    };

    const runCommand = vi.fn<SearchCliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: `${JSON.stringify(rgMatch)}\n`,
      }),
    );

    const registry = createToolRegistry([ createSearchRgTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "search.rg",
      input: {
        query: "Orqent",
        path: "src",
        caseSensitive: false,
        fixedStrings: true,
        includeHidden: true,
        globs: [ "**/*.ts", "**/*.tsx" ],
        maxResults: 10,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "rg",
        args: [
          "--json",
          "--line-number",
          "--column",
          "--color",
          "never",
          "--ignore-case",
          "--fixed-strings",
          "--hidden",
          "--glob",
          "**/*.ts",
          "--glob",
          "**/*.tsx",
          "--",
          "Orqent",
          "src",
        ],
        cwd: "/tmp/project",
      }),
    );

    const searchResult = result.result as SearchRgResult;

    expect(searchResult.count).toBe(1);
    expect(searchResult.matches[ 0 ]).toMatchObject({
      path: "src/app.tsx",
      lineNumber: 10,
      column: 15,
      line: "const name = 'Orqent';",
      matchText: "Orqent",
      submatches: [
        {
          text: "Orqent",
          start: 14,
          end: 20,
        },
      ],
    });
  });

  it("search.rg devuelve lista vacía cuando rg retorna exitCode 1", async () => {
    const runCommand = vi.fn<SearchCliCommandRunner>().mockResolvedValue(
      createCliResult({
        exitCode: 1,
        stdout: "",
      }),
    );

    const registry = createToolRegistry([ createSearchRgTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "search.rg",
      input: {
        query: "missing",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const searchResult = result.result as SearchRgResult;

    expect(searchResult.count).toBe(0);
    expect(searchResult.matches).toEqual([]);
  });

  it("search.rg limita la cantidad de resultados devueltos", async () => {
    const runCommand = vi.fn<SearchCliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout:
          `${JSON.stringify({
            type: "match",
            data: {
              path: { text: "one.ts" },
              lines: { text: "Orqent one\n" },
              line_number: 1,
              submatches: [ { match: { text: "Orqent" }, start: 0, end: 6 } ],
            },
          })}\n` +
          `${JSON.stringify({
            type: "match",
            data: {
              path: { text: "two.ts" },
              lines: { text: "Orqent two\n" },
              line_number: 2,
              submatches: [ { match: { text: "Orqent" }, start: 0, end: 6 } ],
            },
          })}\n`,
      }),
    );

    const registry = createToolRegistry([ createSearchRgTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "search.rg",
      input: {
        query: "Orqent",
        maxResults: 1,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const searchResult = result.result as SearchRgResult;

    expect(searchResult.count).toBe(1);
    expect(searchResult.matches[ 0 ]?.path).toBe("one.ts");
  });

  it("search.rg rechaza query vacío", async () => {
    const registry = createToolRegistry([ createSearchRgTool() ]);

    const result = await executeTool({
      registry,
      toolName: "search.rg",
      input: {
        query: "",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected search.rg to fail.");
    }

    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe(
      "query must be a non-empty string without line breaks.",
    );
  });

  it("search.rg devuelve error controlado cuando rg falla", async () => {
    const runCommand = vi.fn<SearchCliCommandRunner>().mockResolvedValue(
      createCliResult({
        exitCode: 2,
        stderr: "regex parse error",
      }),
    );

    const registry = createToolRegistry([ createSearchRgTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "search.rg",
      input: {
        query: "[",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected search.rg to fail.");
    }

    expect(result.error.code).toBe("search_rg_failed");
    expect(result.error.message).toBe("regex parse error");
  });

  it("search.rg devuelve error específico por timeout", async () => {
    const runCommand = vi.fn<SearchCliCommandRunner>().mockResolvedValue(
      createCliResult({
        exitCode: null,
        timedOut: true,
      }),
    );

    const registry = createToolRegistry([ createSearchRgTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "search.rg",
      input: {
        query: "Orqent",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected search.rg to fail.");
    }

    expect(result.error.code).toBe("search_rg_timed_out");
  });

  it("registra search.find en el registry por defecto", () => {
    expect(defaultToolRegistry.has("search.find")).toBe(true);
  });

  it("search.find ejecuta find mediante el adapter CLI controlado", async () => {
    const runCommand = vi.fn<SearchCliCommandRunner>().mockResolvedValue(
      createCliResult({
        command: "find",
        args: [],
        stdout: [
          "src/app.tsx",
          "src/tools/builtin/search.ts",
          "",
        ].join("\n"),
      }),
    );

    const registry = createToolRegistry([ createSearchFindTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "search.find",
      input: {
        path: "src",
        name: "*.ts",
        kind: "file",
        includeHidden: false,
        maxDepth: 4,
        maxResults: 10,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "find",
        args: [
          "src",
          "-maxdepth",
          "4",
          "-not",
          "-path",
          "*/.*",
          "-type",
          "f",
          "-name",
          "*.ts",
          "-print",
        ],
        cwd: "/tmp/project",
      }),
    );

    const searchResult = result.result as SearchFindResult;

    expect(searchResult.count).toBe(2);
    expect(searchResult.entries).toEqual([
      {
        path: "src/app.tsx",
      },
      {
        path: "src/tools/builtin/search.ts",
      },
    ]);
  });

  it("search.find puede buscar directorios incluyendo ocultos", async () => {
    const runCommand = vi.fn<SearchCliCommandRunner>().mockResolvedValue(
      createCliResult({
        command: "find",
        stdout: ".git\nsrc\n",
      }),
    );

    const registry = createToolRegistry([ createSearchFindTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "search.find",
      input: {
        kind: "directory",
        includeHidden: true,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        args: [
          ".",
          "-type",
          "d",
          "-print",
        ],
      }),
    );
  });

  it("search.find limita la cantidad de resultados devueltos", async () => {
    const runCommand = vi.fn<SearchCliCommandRunner>().mockResolvedValue(
      createCliResult({
        command: "find",
        stdout: "one.ts\ntwo.ts\n",
      }),
    );

    const registry = createToolRegistry([ createSearchFindTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "search.find",
      input: {
        maxResults: 1,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const searchResult = result.result as SearchFindResult;

    expect(searchResult.count).toBe(1);
    expect(searchResult.entries[ 0 ]?.path).toBe("one.ts");
  });

  it("search.find devuelve error controlado cuando find falla", async () => {
    const runCommand = vi.fn<SearchCliCommandRunner>().mockResolvedValue(
      createCliResult({
        command: "find",
        exitCode: 1,
        stderr: "find: missing path",
      }),
    );

    const registry = createToolRegistry([ createSearchFindTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "search.find",
      input: {},
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected search.find to fail.");
    }

    expect(result.error.code).toBe("search_find_failed");
    expect(result.error.message).toBe("find: missing path");
  });
});
