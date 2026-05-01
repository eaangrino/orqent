import { describe, expect, it, vi } from "vitest";
import { createToolRegistry, executeTool } from "../index.js";
import {
  createGitBranchTool,
  createGitDiffTool,
  createGitLogTool,
  createGitRemotesTool,
  createGitShowTool,
  createGitStatusTool,
  type GitBranchResult,
  type GitCliCommandRunner,
  type GitDiffResult,
  type GitLogResult,
  type GitRemotesResult,
  type GitShowResult,
  type GitStatusResult,
} from "../builtin/git.js";
import { defaultToolRegistry } from "../registry.js";

function createCliResult(
  overrides: Partial<Awaited<ReturnType<GitCliCommandRunner>>> = {},
) {
  return {
    command: "git",
    args: [ "status" ],
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

describe("git tools", () => {
  it("registra git.status en el registry por defecto", () => {
    expect(defaultToolRegistry.has("git.status")).toBe(true);
  });

  it("git.status ejecuta git status mediante el adapter CLI controlado", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: [
          "## building...origin/building [ahead 1, behind 2]",
          " M src/app.tsx",
          "A  src/tools/builtin/git.ts",
          "?? src/tools/__tests__/git-tools.test.ts",
          "R  old.ts -> new.ts",
          "",
        ].join("\n"),
      }),
    );

    const registry = createToolRegistry([ createGitStatusTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.status",
      input: {
        includeUntracked: true,
        maxEntries: 10,
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
        command: "git",
        args: [
          "status",
          "--short",
          "--branch",
          "--porcelain=v1",
        ],
        cwd: "/tmp/project",
      }),
    );

    const gitResult = result.result as GitStatusResult;

    expect(gitResult.branch).toBe("building");
    expect(gitResult.upstream).toBe("origin/building");
    expect(gitResult.ahead).toBe(1);
    expect(gitResult.behind).toBe(2);
    expect(gitResult.isClean).toBe(false);
    expect(gitResult.count).toBe(4);
    expect(gitResult.entries[ 0 ]).toMatchObject({
      indexStatus: " ",
      worktreeStatus: "M",
      path: "src/app.tsx",
      originalPath: null,
    });
    expect(gitResult.entries[ 3 ]).toMatchObject({
      indexStatus: "R",
      worktreeStatus: " ",
      path: "new.ts",
      originalPath: "old.ts",
    });
  });

  it("git.status puede excluir archivos untracked", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: "## main\n M README.md\n",
      }),
    );

    const registry = createToolRegistry([ createGitStatusTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.status",
      input: {
        includeUntracked: false,
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
          "status",
          "--short",
          "--branch",
          "--porcelain=v1",
          "--untracked-files=no",
        ],
      }),
    );
  });

  it("git.status marca clean cuando no hay entradas", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: "## main...origin/main\n",
      }),
    );

    const registry = createToolRegistry([ createGitStatusTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.status",
      input: {},
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const gitResult = result.result as GitStatusResult;

    expect(gitResult.isClean).toBe(true);
    expect(gitResult.count).toBe(0);
    expect(gitResult.branch).toBe("main");
    expect(gitResult.upstream).toBe("origin/main");
  });

  it("git.status limita la cantidad de entradas devueltas", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: [
          "## main",
          " M one.ts",
          " M two.ts",
          "",
        ].join("\n"),
      }),
    );

    const registry = createToolRegistry([ createGitStatusTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.status",
      input: {
        maxEntries: 1,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const gitResult = result.result as GitStatusResult;

    expect(gitResult.count).toBe(1);
    expect(gitResult.entries[ 0 ]?.path).toBe("one.ts");
  });

  it("git.status devuelve error controlado cuando git falla", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        exitCode: 128,
        stderr: "fatal: not a git repository",
      }),
    );

    const registry = createToolRegistry([ createGitStatusTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.status",
      input: {},
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected git.status to fail.");
    }

    expect(result.error.code).toBe("git_status_failed");
    expect(result.error.message).toBe("fatal: not a git repository");
    expect(result.metadata).toMatchObject({
      adapter: "cli",
      command: "git",
      exitCode: 128,
    });
  });

  it("git.status devuelve error específico por timeout", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        exitCode: null,
        timedOut: true,
      }),
    );

    const registry = createToolRegistry([ createGitStatusTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.status",
      input: {},
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected git.status to fail.");
    }

    expect(result.error.code).toBe("git_status_timed_out");
    expect(result.metadata).toMatchObject({
      adapter: "cli",
      command: "git",
      timedOut: true,
    });
  });

  it("registra git.diff en el registry por defecto", () => {
    expect(defaultToolRegistry.has("git.diff")).toBe(true);
  });

  it("git.diff ejecuta git diff mediante el adapter CLI controlado", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: "diff --git a/src/app.tsx b/src/app.tsx\n+hola\n",
      }),
    );

    const registry = createToolRegistry([ createGitDiffTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.diff",
      input: {
        staged: false,
        path: "src/app.tsx",
        maxOutputChars: 10000,
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
        command: "git",
        args: [
          "diff",
          "--no-ext-diff",
          "--",
          "src/app.tsx",
        ],
        cwd: "/tmp/project",
        maxOutputChars: 10000,
      }),
    );

    const gitResult = result.result as GitDiffResult;

    expect(gitResult.staged).toBe(false);
    expect(gitResult.path).toBe("src/app.tsx");
    expect(gitResult.diff).toContain("diff --git");
  });

  it("git.diff puede leer diff staged", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: "diff --git a/file.ts b/file.ts\n+staged\n",
      }),
    );

    const registry = createToolRegistry([ createGitDiffTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.diff",
      input: {
        staged: true,
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
          "diff",
          "--no-ext-diff",
          "--cached",
        ],
      }),
    );
  });

  it("git.diff devuelve error controlado cuando git falla", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        exitCode: 129,
        stderr: "fatal: ambiguous argument",
      }),
    );

    const registry = createToolRegistry([ createGitDiffTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.diff",
      input: {
        path: "missing.ts",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected git.diff to fail.");
    }

    expect(result.error.code).toBe("git_diff_failed");
    expect(result.error.message).toBe("fatal: ambiguous argument");
  });

  it("registra git.log en el registry por defecto", () => {
    expect(defaultToolRegistry.has("git.log")).toBe(true);
  });

  it("git.log ejecuta git log mediante el adapter CLI controlado", async () => {
    const separator = "\x1f";

    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: [
          [
            "abcdef123456",
            "abcdef1",
            "eaangrino",
            "eaangrino@example.com",
            "2026-04-30T21:00:00-05:00",
            "10 minutes ago",
            "feat(extensibility): add git tools",
          ].join(separator),
          "",
        ].join("\n"),
      }),
    );

    const registry = createToolRegistry([ createGitLogTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.log",
      input: {
        maxCommits: 5,
        path: "src/tools/builtin/git.ts",
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
        command: "git",
        args: [
          "log",
          "--max-count=5",
          "--format=%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%ar%x1f%s",
          "--",
          "src/tools/builtin/git.ts",
        ],
        cwd: "/tmp/project",
      }),
    );

    const gitResult = result.result as GitLogResult;

    expect(gitResult.count).toBe(1);
    expect(gitResult.commits[ 0 ]).toEqual({
      hash: "abcdef123456",
      shortHash: "abcdef1",
      authorName: "eaangrino",
      authorEmail: "eaangrino@example.com",
      authorDate: "2026-04-30T21:00:00-05:00",
      relativeDate: "10 minutes ago",
      subject: "feat(extensibility): add git tools",
    });
  });

  it("git.log devuelve lista vacía cuando no hay commits", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: "",
      }),
    );

    const registry = createToolRegistry([ createGitLogTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.log",
      input: {},
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const gitResult = result.result as GitLogResult;

    expect(gitResult.count).toBe(0);
    expect(gitResult.commits).toEqual([]);
  });

  it("git.log devuelve error controlado cuando git falla", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        exitCode: 128,
        stderr: "fatal: your current branch does not have any commits yet",
      }),
    );

    const registry = createToolRegistry([ createGitLogTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.log",
      input: {},
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected git.log to fail.");
    }

    expect(result.error.code).toBe("git_log_failed");
    expect(result.error.message).toBe(
      "fatal: your current branch does not have any commits yet",
    );
  });

  it("registra git.branch en el registry por defecto", () => {
    expect(defaultToolRegistry.has("git.branch")).toBe(true);
  });

  it("git.branch ejecuta git branch mediante el adapter CLI controlado", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: [
          "  main",
          "* building",
          "  remotes/origin/HEAD -> origin/main",
          "  remotes/origin/building",
          "",
        ].join("\n"),
      }),
    );

    const registry = createToolRegistry([ createGitBranchTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.branch",
      input: {
        includeRemote: true,
        maxBranches: 10,
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
        command: "git",
        args: [ "branch", "--no-color", "--all" ],
        cwd: "/tmp/project",
      }),
    );

    const gitResult = result.result as GitBranchResult;

    expect(gitResult.currentBranch).toBe("building");
    expect(gitResult.count).toBe(3);
    expect(gitResult.branches).toEqual([
      {
        name: "main",
        current: false,
        remote: false,
        raw: "  main",
      },
      {
        name: "building",
        current: true,
        remote: false,
        raw: "* building",
      },
      {
        name: "remotes/origin/building",
        current: false,
        remote: true,
        raw: "  remotes/origin/building",
      },
    ]);
  });

  it("git.branch limita la cantidad de ramas devueltas", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: [
          "* main",
          "  feature/a",
          "",
        ].join("\n"),
      }),
    );

    const registry = createToolRegistry([ createGitBranchTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.branch",
      input: {
        maxBranches: 1,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const gitResult = result.result as GitBranchResult;

    expect(gitResult.count).toBe(1);
    expect(gitResult.currentBranch).toBe("main");
    expect(gitResult.branches[ 0 ]?.name).toBe("main");
  });

  it("git.branch devuelve error controlado cuando git falla", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        exitCode: 128,
        stderr: "fatal: not a git repository",
      }),
    );

    const registry = createToolRegistry([ createGitBranchTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.branch",
      input: {},
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected git.branch to fail.");
    }

    expect(result.error.code).toBe("git_branch_failed");
    expect(result.error.message).toBe("fatal: not a git repository");
  });

  it("registra git.show en el registry por defecto", () => {
    expect(defaultToolRegistry.has("git.show")).toBe(true);
  });

  it("git.show ejecuta git show mediante el adapter CLI controlado", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: [
          "commit abcdef123456",
          "Author: eaangrino <eaangrino@example.com>",
          "Date:   Thu Apr 30 21:00:00 2026 -0500",
          "",
          "    feat(extensibility): add git tools",
          "",
        ].join("\n"),
      }),
    );

    const registry = createToolRegistry([ createGitShowTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.show",
      input: {
        revision: "HEAD",
        includePatch: false,
        maxOutputChars: 10000,
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
        command: "git",
        args: [
          "show",
          "--no-ext-diff",
          "--no-color",
          "--stat",
          "--no-patch",
          "HEAD",
        ],
        cwd: "/tmp/project",
        maxOutputChars: 10000,
      }),
    );

    const gitResult = result.result as GitShowResult;

    expect(gitResult.revision).toBe("HEAD");
    expect(gitResult.includePatch).toBe(false);
    expect(gitResult.output).toContain("commit abcdef123456");
  });

  it("git.show puede incluir patch", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: "diff --git a/file.ts b/file.ts\n+change\n",
      }),
    );

    const registry = createToolRegistry([ createGitShowTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.show",
      input: {
        revision: "HEAD",
        includePatch: true,
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
          "show",
          "--no-ext-diff",
          "--no-color",
          "--stat",
          "HEAD",
        ],
      }),
    );
  });

  it("git.show rechaza revision vacía", async () => {
    const registry = createToolRegistry([ createGitShowTool() ]);

    const result = await executeTool({
      registry,
      toolName: "git.show",
      input: {
        revision: "",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected git.show to fail.");
    }

    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe(
      "revision must be a non-empty string without line breaks.",
    );
  });

  it("git.show devuelve error controlado cuando git falla", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        exitCode: 128,
        stderr: "fatal: bad revision 'missing'",
      }),
    );

    const registry = createToolRegistry([ createGitShowTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.show",
      input: {
        revision: "missing",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected git.show to fail.");
    }

    expect(result.error.code).toBe("git_show_failed");
    expect(result.error.message).toBe("fatal: bad revision 'missing'");
  });

  it("registra git.remotes en el registry por defecto", () => {
    expect(defaultToolRegistry.has("git.remotes")).toBe(true);
  });

  it("git.remotes ejecuta git remote -v mediante el adapter CLI controlado", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: [
          "origin git@github.com:eaangrino/orqent.git (fetch)",
          "origin git@github.com:eaangrino/orqent.git (push)",
          "",
        ].join("\n"),
      }),
    );

    const registry = createToolRegistry([ createGitRemotesTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.remotes",
      input: {
        maxRemotes: 10,
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
        command: "git",
        args: [ "remote", "-v" ],
        cwd: "/tmp/project",
      }),
    );

    const gitResult = result.result as GitRemotesResult;

    expect(gitResult.count).toBe(2);
    expect(gitResult.remotes).toEqual([
      {
        name: "origin",
        url: "git@github.com:eaangrino/orqent.git",
        type: "fetch",
        raw: "origin git@github.com:eaangrino/orqent.git (fetch)",
      },
      {
        name: "origin",
        url: "git@github.com:eaangrino/orqent.git",
        type: "push",
        raw: "origin git@github.com:eaangrino/orqent.git (push)",
      },
    ]);
  });

  it("git.remotes sanitiza credenciales en URLs HTTPS", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: [
          "origin https://token123@github.com/eaangrino/orqent.git (fetch)",
          "",
        ].join("\n"),
      }),
    );

    const registry = createToolRegistry([ createGitRemotesTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.remotes",
      input: {},
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const gitResult = result.result as GitRemotesResult;

    expect(gitResult.remotes[ 0 ]?.url).toBe(
      "https://redacted@github.com/eaangrino/orqent.git",
    );
    expect(gitResult.remotes[ 0 ]?.raw).not.toContain("token123");
  });

  it("git.remotes limita la cantidad de remotes devueltos", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: [
          "origin git@github.com:eaangrino/orqent.git (fetch)",
          "upstream git@github.com:someone/orqent.git (fetch)",
          "",
        ].join("\n"),
      }),
    );

    const registry = createToolRegistry([ createGitRemotesTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.remotes",
      input: {
        maxRemotes: 1,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const gitResult = result.result as GitRemotesResult;

    expect(gitResult.count).toBe(1);
    expect(gitResult.remotes[ 0 ]?.name).toBe("origin");
  });

  it("git.remotes devuelve error controlado cuando git falla", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        exitCode: 128,
        stderr: "fatal: not a git repository",
      }),
    );

    const registry = createToolRegistry([ createGitRemotesTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.remotes",
      input: {},
      sessionId: "session-test",
      cwd: "/tmp/project",
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected git.remotes to fail.");
    }

    expect(result.error.code).toBe("git_remotes_failed");
    expect(result.error.message).toBe("fatal: not a git repository");
  });
});
