import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import {
  appendAgentTranscriptEntry,
  createAgentBackgroundTaskState,
  createAgentInstance,
  readAgentDefinition,
  readAgentInstance,
  upsertAgentDefinition,
  // listAgentChildTaskSnapshots,
} from "../../agents/index.js";
import { createDefaultPermissionPolicy } from "../../security/index.js";
import {
  agentCreateDefinitionTool,
  agentListDefinitionsTool,
  agentListTasksTool,
  agentReadTranscriptTool,
  agentSpawnTool,
  agentListBackgroundTasksTool,
  agentRunBackgroundTaskTool,
  agentInspectChildrenTool,
  type AgentInspectChildrenResult,
  type AgentRunBackgroundTaskResult,
  type AgentListBackgroundTasksResult,
  type AgentListDefinitionsResult,
  type AgentListTasksResult,
  type AgentReadTranscriptResult,
  type AgentSpawnResult,
} from "../builtin/agents.js";
import { createToolRegistry } from "../registry.js";
import { executeTool } from "../router.js";
import type { ToolExecutionResult } from "../types.js";
import { runQueuedBackgroundTask } from "../../runtime/background-task-runner.js";


const { runSubagentTaskMock } = vi.hoisted(() => ({
  runSubagentTaskMock: vi.fn(),
}));

vi.mock("../../runtime/subagent-runner.js", () => ({
  runSubagentTask: runSubagentTaskMock,
}));

vi.mock("../../runtime/background-task-runner.js", () => ({
  runQueuedBackgroundTask: vi.fn(),
}));

const runQueuedBackgroundTaskMock = vi.mocked(runQueuedBackgroundTask);

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, {
      recursive: true,
      force: true,
    });
    tempDir = "";
  }

  delete process.env.ORQENT_DATA_DIR;
  runSubagentTaskMock.mockReset();
});

beforeEach(() => {
  runQueuedBackgroundTaskMock.mockReset();
});

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

describe("agent.create_definition", () => {
  it("queda bloqueada sin confirmación en ask mode", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([ agentCreateDefinitionTool ]);

    const result = await executeTool({
      registry,
      toolName: "agent.create_definition",
      sessionId: "session-test",
      cwd: tempDir,
      input: {
        identifier: "planner",
        name: "Planner",
        whenToUse: "Use for planning.",
        systemPrompt: "Plan tasks.",
      },
    });

    expectErrorResult(result);
    expect(result.error.code).toBe("tool_confirmation_required");
  });

  it("crea una definición persistente con confirmación", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([ agentCreateDefinitionTool ]);

    const result = await executeTool({
      registry,
      toolName: "agent.create_definition",
      sessionId: "session-test",
      cwd: tempDir,
      input: {
        identifier: "code-reviewer",
        name: "Code Reviewer",
        whenToUse: "Use for reviewing TypeScript code.",
        systemPrompt: "Review code with strict technical feedback.",
        allowedTools: [ "Project.Search", "filesystem.read", "project.search" ],
        model: null,
        scope: "project",
        memoryScope: "session",
        permissionMode: "ask",
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expectOkResult<{
      agent: {
        identifier: string;
        allowedTools: string[];
      };
      filePath: string;
    }>(result);

    expect(result.result.agent.identifier).toBe("code-reviewer");
    expect(result.result.agent.allowedTools).toEqual([
      "filesystem.read",
      "project.search",
    ]);
    expect(result.result.filePath).toContain("agents/definitions.json");

    const persisted = await readAgentDefinition("code-reviewer");

    expect(persisted?.identifier).toBe("code-reviewer");
    expect(persisted?.name).toBe("Code Reviewer");
  });

  it("rechaza input inválido antes de pedir confirmación", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([ agentCreateDefinitionTool ]);

    const result = await executeTool({
      registry,
      toolName: "agent.create_definition",
      sessionId: "session-test",
      cwd: tempDir,
      input: {
        identifier: "",
        name: "Bad Agent",
        whenToUse: "Never.",
        systemPrompt: "Invalid.",
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expectErrorResult(result);
    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe("identifier must be a non-empty string.");
  });

  it("queda bloqueada con permissionPolicy deny", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([ agentCreateDefinitionTool ]);

    const result = await executeTool({
      registry,
      toolName: "agent.create_definition",
      sessionId: "session-test",
      cwd: tempDir,
      input: {
        identifier: "planner",
        name: "Planner",
        whenToUse: "Use for planning.",
        systemPrompt: "Plan tasks.",
      },
      permissionPolicy: createDefaultPermissionPolicy("deny"),
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expectErrorResult(result);
    expect(result.error.code).toBe("tool_permission_denied");
  });
});

describe("agent.list_definitions", () => {
  it("lista definiciones persistentes sin exponer systemPrompt", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([
      agentCreateDefinitionTool,
      agentListDefinitionsTool,
    ]);

    await executeTool({
      registry,
      toolName: "agent.create_definition",
      sessionId: "session-test",
      cwd: tempDir,
      input: {
        identifier: "planner",
        name: "Planner",
        whenToUse: "Use for planning.",
        systemPrompt: "Private planner prompt.",
        allowedTools: [ "filesystem.read" ],
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    const result = await executeTool({
      registry,
      toolName: "agent.list_definitions",
      sessionId: "session-test",
      cwd: tempDir,
      input: {},
    });

    expectOkResult<AgentListDefinitionsResult>(result);

    expect(result.result.count).toBe(1);
    expect(result.result.agents[ 0 ]?.identifier).toBe("planner");
    expect(result.result.agents[ 0 ]).not.toHaveProperty("systemPrompt");
    expect(JSON.stringify(result.result)).not.toContain(
      "Private planner prompt.",
    );
  });

  it("filtra definiciones por identifier exacto", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([
      agentCreateDefinitionTool,
      agentListDefinitionsTool,
    ]);

    await executeTool({
      registry,
      toolName: "agent.create_definition",
      sessionId: "session-test",
      cwd: tempDir,
      input: {
        identifier: "planner",
        name: "Planner",
        whenToUse: "Use for planning.",
        systemPrompt: "Plan tasks.",
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    await executeTool({
      registry,
      toolName: "agent.create_definition",
      sessionId: "session-test",
      cwd: tempDir,
      input: {
        identifier: "tester",
        name: "Tester",
        whenToUse: "Use for tests.",
        systemPrompt: "Write tests.",
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    const result = await executeTool({
      registry,
      toolName: "agent.list_definitions",
      sessionId: "session-test",
      cwd: tempDir,
      input: {
        identifier: "PLANNER",
      },
    });

    expectOkResult<AgentListDefinitionsResult>(result);

    expect(result.result.count).toBe(1);
    expect(result.result.agents[ 0 ]?.identifier).toBe("planner");
  });

  it("rechaza identifier vacío", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([ agentListDefinitionsTool ]);

    const result = await executeTool({
      registry,
      toolName: "agent.list_definitions",
      sessionId: "session-test",
      cwd: tempDir,
      input: {
        identifier: "",
      },
    });

    expectErrorResult(result);
    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe(
      "identifier must not be empty when provided.",
    );
  });
});

describe("agent.spawn", () => {
  it("crea instancia y task state persistentes sin ejecutar el subagente", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([
      agentCreateDefinitionTool,
      agentSpawnTool,
    ]);

    await executeTool({
      registry,
      toolName: "agent.create_definition",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        identifier: "planner",
        name: "Planner",
        whenToUse: "Use for planning.",
        systemPrompt: "Plan technical work.",
        allowedTools: [ "filesystem.read", "project.search" ],
        model: "gemma4:e4b",
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    const result = await executeTool({
      registry,
      toolName: "agent.spawn",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        agentIdentifier: "planner",
        taskInput: "Plan the next implementation step.",
        executeNow: false,
        runInBackground: false,
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expectOkResult<AgentSpawnResult>(result);

    expect(result.result.instance.instanceId).toMatch(/^agent_instance_/);
    expect(result.result.taskState.taskId).toMatch(/^agent_task_/);
    expect(result.result.instance.taskId).toBe(result.result.taskState.taskId);
    expect(result.result.taskState.agentInstanceId).toBe(
      result.result.instance.instanceId,
    );

    expect(result.result.instance.parentSessionId).toBe("session-parent");
    expect(result.result.taskState.parentSessionId).toBe("session-parent");
    expect(result.result.instance.agentIdentifier).toBe("planner");
    expect(result.result.taskState.agentIdentifier).toBe("planner");

    expect(result.result.instance.status).toBe("created");
    expect(result.result.taskState.status).toBe("queued");

    expect(result.result.instance).not.toHaveProperty("systemPrompt");
    expect(JSON.stringify(result.result)).not.toContain("Plan technical work.");

    expect(result.result.execution).toEqual({
      status: "stubbed",
      message:
        "Agent instance and task state were persisted. Subagent execution was not requested.",
    });

    expect(result.result.instanceFilePath).toContain("agents/instances.json");
    expect(result.result.taskStateFilePath).toContain("agents/tasks.json");
  });

  it("queda bloqueada sin confirmación", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([
      agentCreateDefinitionTool,
      agentSpawnTool,
    ]);

    await executeTool({
      registry,
      toolName: "agent.create_definition",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        identifier: "planner",
        name: "Planner",
        whenToUse: "Use for planning.",
        systemPrompt: "Plan technical work.",
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    const result = await executeTool({
      registry,
      toolName: "agent.spawn",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        agentIdentifier: "planner",
        taskInput: "Plan work.",
        executeNow: false,
        runInBackground: false,
      },
    });

    expectErrorResult(result);
    expect(result.error.code).toBe("tool_confirmation_required");
  });

  it("devuelve error si la definición no existe", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([ agentSpawnTool ]);

    const result = await executeTool({
      registry,
      toolName: "agent.spawn",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        agentIdentifier: "missing-agent",
        taskInput: "Plan work.",
        executeNow: false,
        runInBackground: false,
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expectErrorResult(result);
    expect(result.error.code).toBe("agent_definition_not_found");
    expect(result.error.message).toBe(
      'Agent definition "missing-agent" was not found.',
    );
  });

  it("rechaza taskInput vacío", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([ agentSpawnTool ]);

    const result = await executeTool({
      registry,
      toolName: "agent.spawn",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        agentIdentifier: "planner",
        taskInput: "   ",
        executeNow: false,
        runInBackground: false,
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expectErrorResult(result);
    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe("taskInput must be a non-empty string.");
  });
  it("rechaza executeNow=true cuando falta runtime.ollamaHost", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([
      agentCreateDefinitionTool,
      agentSpawnTool,
    ]);

    await executeTool({
      registry,
      toolName: "agent.create_definition",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        identifier: "planner",
        name: "Planner",
        whenToUse: "Use for planning.",
        systemPrompt: "Plan technical work.",
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    const result = await executeTool({
      registry,
      toolName: "agent.spawn",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        agentIdentifier: "planner",
        taskInput: "Plan work.",
        executeNow: true,
        runInBackground: false,
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expectErrorResult(result);
    expect(result.error.code).toBe("agent_spawn_missing_ollama_host");
  });

  it("ejecuta el subagente síncronamente cuando executeNow=true", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([
      agentCreateDefinitionTool,
      agentSpawnTool,
    ]);

    await executeTool({
      registry,
      toolName: "agent.create_definition",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        identifier: "planner",
        name: "Planner",
        whenToUse: "Use for planning.",
        systemPrompt: "Plan technical work.",
        allowedTools: [ "filesystem.read" ],
        model: null,
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    runSubagentTaskMock.mockResolvedValue({
      ok: true,
      instance: {
        instanceId: "agent_instance_mock",
        taskId: "agent_task_mock",
        parentSessionId: "session-parent",
        agentIdentifier: "planner",
        cwd: tempDir,
        model: "llama3.2:3b",
        status: "completed",
        systemPrompt: "Plan technical work.",
        allowedTools: [ "filesystem.read" ],
        createdAt: "2026-04-27T00:00:00.000Z",
        updatedAt: "2026-04-27T00:01:00.000Z",
      },
      taskState: {
        taskId: "agent_task_mock",
        agentInstanceId: "agent_instance_mock",
        parentSessionId: "session-parent",
        agentIdentifier: "planner",
        status: "completed",
        input: "Plan work.",
        result: "Subagent plan ready.",
        error: null,
        createdAt: "2026-04-27T00:00:00.000Z",
        updatedAt: "2026-04-27T00:01:00.000Z",
        startedAt: "2026-04-27T00:00:10.000Z",
        completedAt: "2026-04-27T00:01:00.000Z",
      },
      response: "Subagent plan ready.",
      model: "llama3.2:3b",
    });

    const result = await executeTool({
      registry,
      toolName: "agent.spawn",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        agentIdentifier: "planner",
        taskInput: "Plan work.",
        executeNow: true,
        runInBackground: false,
      },
      runtime: {
        ollamaHost: "http://localhost:11434",
        activeModel: "llama3.2:3b",
        generationOptions: {
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
          numCtx: 8192,
          numPredict: 2048,
          repeatPenalty: 1.1,
        },
        thinkingMode: "default",
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expectOkResult<AgentSpawnResult>(result);

    expect(runSubagentTaskMock).toHaveBeenCalledTimes(1);
    expect(runSubagentTaskMock.mock.calls[ 0 ]?.[ 0 ]).toMatchObject({
      parentSessionId: "session-parent",
      cwd: tempDir,
      taskInput: "Plan work.",
      host: "http://localhost:11434",
      fallbackModel: "llama3.2:3b",
      modelOverride: undefined,
      thinkingMode: "default",
      metadata: {
        createdByTool: "agent.spawn",
        executeNow: true,
        runInBackground: false,
      },
    });

    expect(result.result.execution).toEqual({
      status: "completed",
      response: "Subagent plan ready.",
      model: "llama3.2:3b",
    });

    expect(result.result.instance).toEqual({
      instanceId: "agent_instance_mock",
      taskId: "agent_task_mock",
      parentSessionId: "session-parent",
      agentIdentifier: "planner",
      cwd: tempDir,
      model: "llama3.2:3b",
      status: "completed",
      allowedTools: [ "filesystem.read" ],
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:01:00.000Z",
    });

    expect(result.result.taskState).toMatchObject({
      taskId: "agent_task_mock",
      status: "completed",
      result: "Subagent plan ready.",
    });

    expect(JSON.stringify(result.result)).not.toContain("Plan technical work.");
  });

  it("retorna execution failed cuando el runner del subagente falla", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([
      agentCreateDefinitionTool,
      agentSpawnTool,
    ]);

    await executeTool({
      registry,
      toolName: "agent.create_definition",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        identifier: "planner",
        name: "Planner",
        whenToUse: "Use for planning.",
        systemPrompt: "Plan technical work.",
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    runSubagentTaskMock.mockResolvedValue({
      ok: false,
      instance: {
        instanceId: "agent_instance_failed_mock",
        taskId: "agent_task_failed_mock",
        parentSessionId: "session-parent",
        agentIdentifier: "planner",
        cwd: tempDir,
        model: "llama3.2:3b",
        status: "failed",
        systemPrompt: "Plan technical work.",
        allowedTools: [],
        createdAt: "2026-04-27T00:00:00.000Z",
        updatedAt: "2026-04-27T00:01:00.000Z",
      },
      taskState: {
        taskId: "agent_task_failed_mock",
        agentInstanceId: "agent_instance_failed_mock",
        parentSessionId: "session-parent",
        agentIdentifier: "planner",
        status: "failed",
        input: "Plan work.",
        result: null,
        error: "Ollama failed.",
        createdAt: "2026-04-27T00:00:00.000Z",
        updatedAt: "2026-04-27T00:01:00.000Z",
        startedAt: "2026-04-27T00:00:10.000Z",
        completedAt: "2026-04-27T00:01:00.000Z",
      },
      error: "Ollama failed.",
    });

    const result = await executeTool({
      registry,
      toolName: "agent.spawn",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        agentIdentifier: "planner",
        taskInput: "Plan work.",
        executeNow: true,
        runInBackground: false,
      },
      runtime: {
        ollamaHost: "http://localhost:11434",
        activeModel: "llama3.2:3b",
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expectOkResult<AgentSpawnResult>(result);

    expect(result.result.execution).toEqual({
      status: "failed",
      error: "Ollama failed.",
    });

    expect(result.result.instance.status).toBe("failed");
    expect(result.result.taskState.status).toBe("failed");
    expect(result.result.taskState.error).toBe("Ollama failed.");
  });

  it("rechaza spawn sin executeNow explícito", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([ agentSpawnTool ]);

    const result = await executeTool({
      registry,
      toolName: "agent.spawn",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        agentIdentifier: "planner",
        taskInput: "Plan work.",
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expectErrorResult(result);
    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe("executeNow must be a boolean.");
  });

  it("rechaza spawn sin runInBackground explícito", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([ agentSpawnTool ]);

    const result = await executeTool({
      registry,
      toolName: "agent.spawn",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        agentIdentifier: "planner",
        taskInput: "Plan work.",
        executeNow: false,
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expectErrorResult(result);
    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe("runInBackground must be a boolean.");
  });
});

describe("agent.list_tasks", () => {
  it("lista task states persistentes de subagentes", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([
      agentCreateDefinitionTool,
      agentSpawnTool,
      agentListTasksTool,
    ]);

    await executeTool({
      registry,
      toolName: "agent.create_definition",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        identifier: "planner",
        name: "Planner",
        whenToUse: "Use for planning.",
        systemPrompt: "Plan technical work.",
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    await executeTool({
      registry,
      toolName: "agent.spawn",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        agentIdentifier: "planner",
        taskInput: "Plan the next implementation step.",
        executeNow: false,
        runInBackground: false,
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    const result = await executeTool({
      registry,
      toolName: "agent.list_tasks",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {},
    });

    expectOkResult<AgentListTasksResult>(result);

    expect(result.result.count).toBe(1);
    expect(result.result.tasks[ 0 ]?.agentIdentifier).toBe("planner");
    expect(result.result.tasks[ 0 ]?.parentSessionId).toBe("session-parent");
    expect(result.result.tasks[ 0 ]?.status).toBe("queued");
    expect(result.result.filePath).toContain("agents/tasks.json");
  });

  it("filtra task states por parentSessionId, agentIdentifier y status", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([
      agentCreateDefinitionTool,
      agentSpawnTool,
      agentListTasksTool,
    ]);

    await executeTool({
      registry,
      toolName: "agent.create_definition",
      sessionId: "session-a",
      cwd: tempDir,
      input: {
        identifier: "planner",
        name: "Planner",
        whenToUse: "Use for planning.",
        systemPrompt: "Plan technical work.",
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    await executeTool({
      registry,
      toolName: "agent.create_definition",
      sessionId: "session-a",
      cwd: tempDir,
      input: {
        identifier: "tester",
        name: "Tester",
        whenToUse: "Use for tests.",
        systemPrompt: "Write tests.",
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    await executeTool({
      registry,
      toolName: "agent.spawn",
      sessionId: "session-a",
      cwd: tempDir,
      input: {
        agentIdentifier: "planner",
        taskInput: "Plan work.",
        executeNow: false,
        runInBackground: false,
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    await executeTool({
      registry,
      toolName: "agent.spawn",
      sessionId: "session-b",
      cwd: tempDir,
      input: {
        agentIdentifier: "tester",
        taskInput: "Write tests.",
        executeNow: false,
        runInBackground: false,
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    const result = await executeTool({
      registry,
      toolName: "agent.list_tasks",
      sessionId: "session-a",
      cwd: tempDir,
      input: {
        parentSessionId: "session-a",
        agentIdentifier: "planner",
        status: "queued",
      },
    });

    expectOkResult<AgentListTasksResult>(result);

    expect(result.result.count).toBe(1);
    expect(result.result.tasks[ 0 ]?.parentSessionId).toBe("session-a");
    expect(result.result.tasks[ 0 ]?.agentIdentifier).toBe("planner");
    expect(result.result.tasks[ 0 ]?.status).toBe("queued");
  });

  it("rechaza status inválido", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([ agentListTasksTool ]);

    const result = await executeTool({
      registry,
      toolName: "agent.list_tasks",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        status: "unknown",
      },
    });

    expectErrorResult(result);
    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe(
      'status must be one of "queued", "running", "completed", "failed", "cancelled".',
    );
  });
});

describe("agent.read_transcript", () => {
  it("lee transcript aislado de una instancia de subagente", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([
      agentCreateDefinitionTool,
      agentSpawnTool,
      agentReadTranscriptTool,
    ]);

    await executeTool({
      registry,
      toolName: "agent.create_definition",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        identifier: "planner",
        name: "Planner",
        whenToUse: "Use for planning.",
        systemPrompt: "Plan technical work.",
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    const spawnResult = await executeTool({
      registry,
      toolName: "agent.spawn",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        agentIdentifier: "planner",
        taskInput: "Plan work.",
        executeNow: false,
        runInBackground: false,
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expectOkResult<AgentSpawnResult>(spawnResult);

    const instance = await readAgentInstance(
      spawnResult.result.instance.instanceId,
    );

    expect(instance).not.toBeNull();

    if (!instance) {
      throw new Error("Expected persisted agent instance.");
    }

    await appendAgentTranscriptEntry(instance, {
      role: "system",
      content: "System prompt.",
      model: "gemma4:e4b",
    });

    await appendAgentTranscriptEntry(instance, {
      role: "user",
      content: "Plan work.",
      model: "gemma4:e4b",
    });

    await appendAgentTranscriptEntry(instance, {
      role: "assistant",
      content: "Done.",
      model: "gemma4:e4b",
    });

    const result = await executeTool({
      registry,
      toolName: "agent.read_transcript",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        instanceId: instance.instanceId,
      },
    });

    expectOkResult<AgentReadTranscriptResult>(result);

    expect(result.result.instanceId).toBe(instance.instanceId);
    expect(result.result.count).toBe(3);
    expect(result.result.filePath).toContain("agents/transcripts/");
    expect(result.result.entries.map((entry) => entry.role)).toEqual([
      "system",
      "user",
      "assistant",
    ]);
    expect(result.result.entries[ 2 ]?.content).toBe("Done.");
  });

  it("devuelve transcript vacío cuando la instancia no tiene transcript", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([ agentReadTranscriptTool ]);

    const result = await executeTool({
      registry,
      toolName: "agent.read_transcript",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        instanceId: "agent_instance_missing",
      },
    });

    expectOkResult<AgentReadTranscriptResult>(result);

    expect(result.result).toMatchObject({
      instanceId: "agent_instance_missing",
      entries: [],
      count: 0,
    });
  });

  it("rechaza instanceId vacío", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([ agentReadTranscriptTool ]);

    const result = await executeTool({
      registry,
      toolName: "agent.read_transcript",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        instanceId: "   ",
      },
    });

    expectErrorResult(result);
    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe(
      "instanceId must be a non-empty string.",
    );
  });
});

describe("agent.list_background_tasks", () => {
  it("lista background tasks creadas por agent.spawn", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([
      agentCreateDefinitionTool,
      agentSpawnTool,
      agentListBackgroundTasksTool,
    ]);

    await executeTool({
      registry,
      toolName: "agent.create_definition",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        identifier: "planner",
        name: "Planner",
        whenToUse: "Use for planning.",
        systemPrompt: "Plan technical work.",
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    const spawnResult = await executeTool({
      registry,
      toolName: "agent.spawn",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        agentIdentifier: "planner",
        taskInput: "Plan work in background.",
        executeNow: false,
        runInBackground: true,
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expectOkResult<AgentSpawnResult>(spawnResult);

    expect(spawnResult.result.execution.status).toBe("background_queued");
    expect(spawnResult.result.backgroundTask?.status).toBe("queued");

    const result = await executeTool({
      registry,
      toolName: "agent.list_background_tasks",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {},
    });

    expectOkResult<AgentListBackgroundTasksResult>(result);

    expect(result.result.count).toBe(1);
    expect(result.result.backgroundTasks[ 0 ]).toMatchObject({
      parentSessionId: "session-parent",
      agentIdentifier: "planner",
      status: "queued",
      input: "Plan work in background.",
    });
    expect(result.result.filePath).toContain("agents/background-tasks.json");
  });

  it("filtra background tasks por parentSessionId, agentIdentifier y status", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([
      agentCreateDefinitionTool,
      agentSpawnTool,
      agentListBackgroundTasksTool,
    ]);

    await executeTool({
      registry,
      toolName: "agent.create_definition",
      sessionId: "session-a",
      cwd: tempDir,
      input: {
        identifier: "planner",
        name: "Planner",
        whenToUse: "Use for planning.",
        systemPrompt: "Plan technical work.",
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    await executeTool({
      registry,
      toolName: "agent.create_definition",
      sessionId: "session-a",
      cwd: tempDir,
      input: {
        identifier: "tester",
        name: "Tester",
        whenToUse: "Use for tests.",
        systemPrompt: "Write tests.",
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    await executeTool({
      registry,
      toolName: "agent.spawn",
      sessionId: "session-a",
      cwd: tempDir,
      input: {
        agentIdentifier: "planner",
        taskInput: "Plan work.",
        executeNow: false,
        runInBackground: true,
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    await executeTool({
      registry,
      toolName: "agent.spawn",
      sessionId: "session-b",
      cwd: tempDir,
      input: {
        agentIdentifier: "tester",
        taskInput: "Write tests.",
        executeNow: false,
        runInBackground: true,
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    const result = await executeTool({
      registry,
      toolName: "agent.list_background_tasks",
      sessionId: "session-a",
      cwd: tempDir,
      input: {
        parentSessionId: "session-a",
        agentIdentifier: "planner",
        status: "queued",
      },
    });

    expectOkResult<AgentListBackgroundTasksResult>(result);

    expect(result.result.count).toBe(1);
    expect(result.result.backgroundTasks[ 0 ]?.parentSessionId).toBe("session-a");
    expect(result.result.backgroundTasks[ 0 ]?.agentIdentifier).toBe("planner");
    expect(result.result.backgroundTasks[ 0 ]?.status).toBe("queued");
  });

  it("rechaza status inválido", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([ agentListBackgroundTasksTool ]);

    const result = await executeTool({
      registry,
      toolName: "agent.list_background_tasks",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        status: "unknown",
      },
    });

    expectErrorResult(result);
    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe(
      'status must be one of "queued", "running", "completed", "failed", "cancelled".',
    );
  });
});

describe("agent.run_background_task", () => {
  it("ejecuta una background task queued usando el runner", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([ agentRunBackgroundTaskTool ]);

    const definition = await upsertAgentDefinition({
      identifier: "planner",
      name: "Planner",
      whenToUse: "Use for planning.",
      systemPrompt: "Plan technical work.",
      model: "gemma4:e4b",
    });

    const { instance, taskState } = createAgentInstance({
      definition,
      parentSessionId: "session-parent",
      cwd: tempDir,
      taskInput: "Plan background work.",
    });

    const backgroundTask = createAgentBackgroundTaskState({
      instance,
      taskState,
    });

    runQueuedBackgroundTaskMock.mockResolvedValueOnce({
      ok: true,
      backgroundTask: {
        ...backgroundTask,
        status: "completed",
        result: "Background plan ready.",
        error: null,
      },
      instance: {
        ...instance,
        status: "completed",
      },
      taskState: {
        ...taskState,
        status: "completed",
        result: "Background plan ready.",
        error: null,
      },
      response: "Background plan ready.",
      model: "gemma4:e4b",
    });

    const result = await executeTool({
      registry,
      toolName: "agent.run_background_task",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        backgroundTaskId: backgroundTask.backgroundTaskId,
      },
      runtime: {
        ollamaHost: "http://localhost:11434",
        activeModel: "gemma4:e4b",
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expectOkResult<AgentRunBackgroundTaskResult>(result);

    expect(runQueuedBackgroundTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        backgroundTaskId: backgroundTask.backgroundTaskId,
        host: "http://localhost:11434",
        fallbackModel: "gemma4:e4b",
      }),
    );

    expect(result.result.execution).toEqual({
      status: "completed",
      response: "Background plan ready.",
      model: "gemma4:e4b",
    });
    expect(result.result.backgroundTask?.status).toBe("completed");
    expect(result.result.taskState?.status).toBe("completed");
    expect(result.result.instance?.status).toBe("completed");
  });

  it("retorna execution failed cuando el runner falla", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([ agentRunBackgroundTaskTool ]);

    runQueuedBackgroundTaskMock.mockResolvedValueOnce({
      ok: false,
      backgroundTask: null,
      instance: null,
      taskState: null,
      error: "Background task \"missing\" was not found.",
    });

    const result = await executeTool({
      registry,
      toolName: "agent.run_background_task",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        backgroundTaskId: "missing",
      },
      runtime: {
        ollamaHost: "http://localhost:11434",
        activeModel: "gemma4:e4b",
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expectOkResult<AgentRunBackgroundTaskResult>(result);

    expect(result.result.execution).toEqual({
      status: "failed",
      error: "Background task \"missing\" was not found.",
    });
  });

  it("rechaza backgroundTaskId vacío", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([ agentRunBackgroundTaskTool ]);

    const result = await executeTool({
      registry,
      toolName: "agent.run_background_task",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        backgroundTaskId: "   ",
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expectErrorResult(result);
    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe(
      "backgroundTaskId must be a non-empty string.",
    );
  });

  it("rechaza ejecución sin runtime.ollamaHost", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([ agentRunBackgroundTaskTool ]);

    const result = await executeTool({
      registry,
      toolName: "agent.run_background_task",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        backgroundTaskId: "agent_background_task_test",
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expectErrorResult(result);
    expect(result.error.code).toBe("missing_runtime_context");
    expect(result.error.message).toBe(
      "agent.run_background_task requires runtime.ollamaHost.",
    );
  });
});

describe("agent.inspect_children", () => {
  it("inspecciona hijos de la sesión actual usando context.sessionId por defecto", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([
      agentCreateDefinitionTool,
      agentSpawnTool,
      agentInspectChildrenTool,
    ]);

    await executeTool({
      registry,
      toolName: "agent.create_definition",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        identifier: "planner",
        name: "Planner",
        whenToUse: "Use for planning.",
        systemPrompt: "Plan technical work.",
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    const spawnResult = await executeTool({
      registry,
      toolName: "agent.spawn",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        agentIdentifier: "planner",
        taskInput: "Plan child work.",
        executeNow: false,
        runInBackground: false,
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expectOkResult<AgentSpawnResult>(spawnResult);

    const result = await executeTool({
      registry,
      toolName: "agent.inspect_children",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {},
    });

    expectOkResult<AgentInspectChildrenResult>(result);

    expect(result.result.parentSessionId).toBe("session-parent");
    expect(result.result.count).toBe(1);
    expect(result.result.children[ 0 ]).toMatchObject({
      parentSessionId: "session-parent",
      agentIdentifier: "planner",
      input: "Plan child work.",
      status: {
        instance: "created",
        task: "queued",
        background: null,
      },
      result: null,
      error: null,
    });
  });

  it("incluye transcript cuando includeTranscript=true", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([
      agentCreateDefinitionTool,
      agentSpawnTool,
      agentInspectChildrenTool,
    ]);

    await executeTool({
      registry,
      toolName: "agent.create_definition",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        identifier: "planner",
        name: "Planner",
        whenToUse: "Use for planning.",
        systemPrompt: "Plan technical work.",
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    const spawnResult = await executeTool({
      registry,
      toolName: "agent.spawn",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        agentIdentifier: "planner",
        taskInput: "Plan child work.",
        executeNow: false,
        runInBackground: false,
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    expectOkResult<AgentSpawnResult>(spawnResult);

    const instance = await readAgentInstance(
      spawnResult.result.instance.instanceId,
    );

    expect(instance).not.toBeNull();

    if (!instance) {
      throw new Error("Expected persisted agent instance.");
    }

    await appendAgentTranscriptEntry(instance, {
      role: "user",
      content: "Plan child work.",
      model: "gemma4:e4b",
    });

    const result = await executeTool({
      registry,
      toolName: "agent.inspect_children",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        includeTranscript: true,
      },
    });

    expectOkResult<AgentInspectChildrenResult>(result);

    expect(result.result.count).toBe(1);
    expect(result.result.children[ 0 ]?.transcript).toHaveLength(1);
    expect(result.result.children[ 0 ]?.transcript[ 0 ]?.content).toBe(
      "Plan child work.",
    );
  });

  it("filtra por parentSessionId explícito", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([
      agentCreateDefinitionTool,
      agentSpawnTool,
      agentInspectChildrenTool,
    ]);

    await executeTool({
      registry,
      toolName: "agent.create_definition",
      sessionId: "session-a",
      cwd: tempDir,
      input: {
        identifier: "planner",
        name: "Planner",
        whenToUse: "Use for planning.",
        systemPrompt: "Plan technical work.",
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    await executeTool({
      registry,
      toolName: "agent.spawn",
      sessionId: "session-a",
      cwd: tempDir,
      input: {
        agentIdentifier: "planner",
        taskInput: "Plan A.",
        executeNow: false,
        runInBackground: false,
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    await executeTool({
      registry,
      toolName: "agent.spawn",
      sessionId: "session-b",
      cwd: tempDir,
      input: {
        agentIdentifier: "planner",
        taskInput: "Plan B.",
        executeNow: false,
        runInBackground: false,
      },
      confirmToolExecution: async () => ({
        allowed: true,
      }),
    });

    const result = await executeTool({
      registry,
      toolName: "agent.inspect_children",
      sessionId: "session-current",
      cwd: tempDir,
      input: {
        parentSessionId: "session-a",
      },
    });

    expectOkResult<AgentInspectChildrenResult>(result);

    expect(result.result.parentSessionId).toBe("session-a");
    expect(result.result.count).toBe(1);
    expect(result.result.children[ 0 ]?.input).toBe("Plan A.");
  });

  it("rechaza includeTranscript inválido", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-agent-tool-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const registry = createToolRegistry([ agentInspectChildrenTool ]);

    const result = await executeTool({
      registry,
      toolName: "agent.inspect_children",
      sessionId: "session-parent",
      cwd: tempDir,
      input: {
        includeTranscript: "yes",
      },
    });

    expectErrorResult(result);
    expect(result.error.code).toBe("invalid_tool_input");
    expect(result.error.message).toBe(
      "includeTranscript must be a boolean when provided.",
    );
  });
});