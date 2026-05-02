import { describe, expect, it, vi } from "vitest";
import { createToolRegistry, executeTool } from "../index.js";
import {
  createGitBranchTool,
  createGitDiffTool,
  createGitLogTool,
  createGitRemotesTool,
  createGitShowTool,
  createGitStatusTool,
  createGitCloneTool,
  createGitFetchTool,
  createGitPullTool,
  createGitAddTool,
  createGitCheckoutTool,
  createGitCommitTool,
  createGitSwitchTool,
  createGitPushTool,
  type GitMutatingResult,
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

  it("registra git.clone, git.fetch y git.pull en el registry por defecto", () => {
    expect(defaultToolRegistry.has("git.clone")).toBe(true);
    expect(defaultToolRegistry.has("git.fetch")).toBe(true);
    expect(defaultToolRegistry.has("git.pull")).toBe(true);
  });

  it("git.clone ejecuta git clone mediante el adapter CLI controlado", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: "Cloning into 'orqent'...\n",
      }),
    );

    const registry = createToolRegistry([ createGitCloneTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.clone",
      input: {
        repositoryUrl: "git@github.com:eaangrino/orqent.git",
        directory: "orqent",
        branch: "building",
        depth: 1,
        singleBranch: true,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "git",
        args: [
          "clone",
          "--depth",
          "1",
          "--single-branch",
          "--branch",
          "building",
          "--",
          "git@github.com:eaangrino/orqent.git",
          "orqent",
        ],
        cwd: "/tmp/project",
        timeoutMs: 120_000,
      }),
    );

    const gitResult = result.result as GitMutatingResult;

    expect(gitResult.operation).toBe("clone");
    expect(gitResult.stdout).toContain("Cloning into");
  });

  it("git.fetch ejecuta git fetch con prune y tags", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: "From github.com:eaangrino/orqent\n",
      }),
    );

    const registry = createToolRegistry([ createGitFetchTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.fetch",
      input: {
        remote: "origin",
        refspec: "building",
        prune: true,
        tags: true,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "git",
        args: [
          "fetch",
          "--prune",
          "--tags",
          "origin",
          "building",
        ],
        cwd: "/tmp/project",
      }),
    );

    const gitResult = result.result as GitMutatingResult;

    expect(gitResult.operation).toBe("fetch");
  });

  it("git.pull ejecuta git pull --ff-only por defecto", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: "Already up to date.\n",
      }),
    );

    const registry = createToolRegistry([ createGitPullTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.pull",
      input: {
        remote: "origin",
        branch: "building",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "git",
        args: [
          "pull",
          "--ff-only",
          "origin",
          "building",
        ],
        cwd: "/tmp/project",
      }),
    );

    const gitResult = result.result as GitMutatingResult;

    expect(gitResult.operation).toBe("pull");
  });

  it("git.clone/fetch/pull requieren confirmación", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>();
    const registry = createToolRegistry([ createGitFetchTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.fetch",
      input: {
        remote: "origin",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: false,
        reason: "No ejecutar fetch ahora.",
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected git.fetch to be denied.");
    }

    expect(result.error.code).toBe("tool_confirmation_denied");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("git.clone rechaza URLs HTTPS con credenciales embebidas", async () => {
    const registry = createToolRegistry([ createGitCloneTool() ]);

    const result = await executeTool({
      registry,
      toolName: "git.clone",
      input: {
        repositoryUrl: "https://token123@github.com/eaangrino/orqent.git",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected git.clone to fail.");
    }

    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe(
      "repositoryUrl must not include embedded HTTP credentials. Use configured Git credentials or SSH instead.",
    );
  });

  it("git.pull devuelve error controlado cuando git falla", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        exitCode: 128,
        stderr: "fatal: Not possible to fast-forward, aborting.",
      }),
    );

    const registry = createToolRegistry([ createGitPullTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.pull",
      input: {
        remote: "origin",
        branch: "main",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected git.pull to fail.");
    }

    expect(result.error.code).toBe("git_pull_failed");
    expect(result.error.message).toBe(
      "fatal: Not possible to fast-forward, aborting.",
    );
  });

  it("registra git.checkout, git.switch, git.add y git.commit en el registry por defecto", () => {
    expect(defaultToolRegistry.has("git.checkout")).toBe(true);
    expect(defaultToolRegistry.has("git.switch")).toBe(true);
    expect(defaultToolRegistry.has("git.add")).toBe(true);
    expect(defaultToolRegistry.has("git.commit")).toBe(true);
  });

  it("git.checkout ejecuta git checkout mediante el adapter CLI controlado", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: "Switched to branch 'building'\n",
      }),
    );

    const registry = createToolRegistry([ createGitCheckoutTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.checkout",
      input: {
        target: "origin/building",
        createBranch: "building",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "git",
        args: [
          "checkout",
          "-b",
          "building",
          "origin/building",
        ],
        cwd: "/tmp/project",
        timeoutMs: 120_000,
      }),
    );

    const gitResult = result.result as GitMutatingResult;

    expect(gitResult.operation).toBe("checkout");
  });

  it("git.switch ejecuta git switch con create y track", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: "branch 'feature/test' set up to track 'origin/feature/test'\n",
      }),
    );

    const registry = createToolRegistry([ createGitSwitchTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.switch",
      input: {
        branch: "origin/feature/test",
        create: true,
        track: true,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "git",
        args: [
          "switch",
          "--create",
          "--track",
          "origin/feature/test",
        ],
        cwd: "/tmp/project",
      }),
    );

    const gitResult = result.result as GitMutatingResult;

    expect(gitResult.operation).toBe("switch");
  });

  it("git.add ejecuta git add con separador -- para paths", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: "",
      }),
    );

    const registry = createToolRegistry([ createGitAddTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.add",
      input: {
        paths: [
          "src/tools/builtin/git.ts",
          "src/tools/__tests__/git-tools.test.ts",
        ],
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "git",
        args: [
          "add",
          "--",
          "src/tools/builtin/git.ts",
          "src/tools/__tests__/git-tools.test.ts",
        ],
        cwd: "/tmp/project",
      }),
    );

    const gitResult = result.result as GitMutatingResult;

    expect(gitResult.operation).toBe("add");
  });

  it("git.commit ejecuta git commit -m con mensaje multilinea", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: "[building abc1234] feat: add git tools\n 2 files changed\n",
      }),
    );

    const registry = createToolRegistry([ createGitCommitTool(runCommand) ]);

    const message = [
      "feat: add git mutating tools",
      "",
      "Add checkout, switch, add and commit adapters.",
    ].join("\n");

    const result = await executeTool({
      registry,
      toolName: "git.commit",
      input: {
        message,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "git",
        args: [
          "commit",
          "-m",
          message,
        ],
        cwd: "/tmp/project",
      }),
    );

    const gitResult = result.result as GitMutatingResult;

    expect(gitResult.operation).toBe("commit");
  });

  it("git.add rechaza paths vacíos o tipo inválido", async () => {
    const registry = createToolRegistry([ createGitAddTool() ]);

    const result = await executeTool({
      registry,
      toolName: "git.add",
      input: {
        paths: [],
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected git.add to fail.");
    }

    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe(
      "paths must be a non-empty array of path strings.",
    );
  });

  it("git.checkout rechaza target que empieza con guion", async () => {
    const registry = createToolRegistry([ createGitCheckoutTool() ]);

    const result = await executeTool({
      registry,
      toolName: "git.checkout",
      input: {
        target: "--orphan",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected git.checkout to fail.");
    }

    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe(
      "target must be a non-empty string without line breaks and must not start with '-'.",
    );
  });

  it("git.commit rechaza mensaje vacío", async () => {
    const registry = createToolRegistry([ createGitCommitTool() ]);

    const result = await executeTool({
      registry,
      toolName: "git.commit",
      input: {
        message: "",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected git.commit to fail.");
    }

    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe("message must be a non-empty string.");
  });

  it("git.checkout/switch/add/commit requieren confirmación", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>();
    const registry = createToolRegistry([ createGitCommitTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.commit",
      input: {
        message: "test commit",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: false,
        reason: "No crear commit ahora.",
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected git.commit to be denied.");
    }

    expect(result.error.code).toBe("tool_confirmation_denied");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("registra git.push en el registry por defecto", () => {
    expect(defaultToolRegistry.has("git.push")).toBe(true);
  });

  it("git.push ejecuta git push con upstream mediante el adapter CLI controlado", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: "branch 'building' set up to track 'origin/building'\n",
      }),
    );

    const registry = createToolRegistry([ createGitPushTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.push",
      input: {
        remote: "origin",
        branch: "building",
        setUpstream: true,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "git",
        args: [
          "push",
          "--set-upstream",
          "origin",
          "building",
        ],
        cwd: "/tmp/project",
        timeoutMs: 120_000,
      }),
    );

    const gitResult = result.result as GitMutatingResult;

    expect(gitResult.operation).toBe("push");
  });

  it("git.push soporta forceWithLease sin exponer raw force", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        stdout: "Everything up-to-date\n",
      }),
    );

    const registry = createToolRegistry([ createGitPushTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.push",
      input: {
        remote: "origin",
        branch: "building",
        forceWithLease: true,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "git",
        args: [
          "push",
          "--force-with-lease",
          "origin",
          "building",
        ],
      }),
    );
  });

  it("git.push requiere confirmación", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>();
    const registry = createToolRegistry([ createGitPushTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.push",
      input: {
        remote: "origin",
        branch: "building",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: false,
        reason: "No hacer push ahora.",
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected git.push to be denied.");
    }

    expect(result.error.code).toBe("tool_confirmation_denied");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("git.push rechaza branch sin remote", async () => {
    const registry = createToolRegistry([ createGitPushTool() ]);

    const result = await executeTool({
      registry,
      toolName: "git.push",
      input: {
        branch: "building",
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected git.push to fail.");
    }

    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe("branch requires remote when provided.");
  });

  it("git.push rechaza setUpstream sin remote y branch", async () => {
    const registry = createToolRegistry([ createGitPushTool() ]);

    const result = await executeTool({
      registry,
      toolName: "git.push",
      input: {
        setUpstream: true,
      },
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected git.push to fail.");
    }

    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe(
      "setUpstream requires both remote and branch.",
    );
  });

  it("git.push devuelve error controlado cuando git falla", async () => {
    const runCommand = vi.fn<GitCliCommandRunner>().mockResolvedValue(
      createCliResult({
        exitCode: 128,
        stderr: "fatal: The current branch building has no upstream branch.",
      }),
    );

    const registry = createToolRegistry([ createGitPushTool(runCommand) ]);

    const result = await executeTool({
      registry,
      toolName: "git.push",
      input: {},
      sessionId: "session-test",
      cwd: "/tmp/project",
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected git.push to fail.");
    }

    expect(result.error.code).toBe("git_push_failed");
    expect(result.error.message).toBe(
      "fatal: The current branch building has no upstream branch.",
    );
  });
});
