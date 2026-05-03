import { describe, expect, it } from "vitest";
import {
  buildToolResultContent,
  buildToolResultMessage,
} from "../tool-result-message.js";
import type { ToolExecutionResult } from "../../tools/index.js";

describe("tool-result-message", () => {
  it("construye mensaje genérico de tool_result", () => {
    const result: ToolExecutionResult = {
      ok: true,
      result: {
        value: "ok",
      },
    };

    const content = buildToolResultContent({
      toolName: "test.echo",
      input: {
        value: "hello",
      },
      result,
    });

    expect(content).toContain("Orqent runtime executed a tool");
    expect(content).toContain("<tool_result>");
    expect(content).toContain('"toolName": "test.echo"');
    expect(content).toContain('"ok": true');
    expect(content).not.toContain("Agent spawn result handling:");
  });

  it("incluye guía específica cuando agent.spawn queda stubbed", () => {
    const result: ToolExecutionResult = {
      ok: true,
      result: {
        execution: {
          status: "stubbed",
          message:
            "Agent instance and task state were persisted. Subagent execution was not requested.",
        },
      },
    };

    const content = buildToolResultContent({
      toolName: "agent.spawn",
      input: {
        agentIdentifier: "planner",
        taskInput: "Plan work.",
      },
      result,
    });

    expect(content).toContain("Agent spawn result handling:");
    expect(content).toContain('If execution.status is "stubbed"');
    expect(content).toContain(
      "Do not invent a child-agent answer.",
    );
    expect(content).toContain("Current execution.status: stubbed");
  });

  it("incluye guía específica cuando agent.spawn queda background_queued", () => {
    const result: ToolExecutionResult = {
      ok: true,
      result: {
        execution: {
          status: "background_queued",
          backgroundTaskId: "agent_background_task_test",
          message:
            "Agent instance, task state, and background task were persisted. Background execution is not implemented yet.",
        },
      },
    };

    const content = buildToolResultContent({
      toolName: "agent.spawn",
      input: {
        agentIdentifier: "planner",
        taskInput: "Plan work.",
        executeNow: false,
        runInBackground: true,
      },
      result,
    });

    expect(content).toContain("Agent spawn result handling:");
    expect(content).toContain('If execution.status is "background_queued"');
    expect(content).toContain(
      "report only that the background task was queued",
    );
    expect(content).toContain("Do not claim that it executed");
    expect(content).toContain("Current execution.status: background_queued");
  });

  it("incluye guía específica cuando agent.spawn completed trae respuesta del subagente", () => {
    const result: ToolExecutionResult = {
      ok: true,
      result: {
        execution: {
          status: "completed",
          response: "Subagent plan ready.",
          model: "llama3.2:3b",
        },
      },
    };

    const content = buildToolResultContent({
      toolName: "agent.spawn",
      input: {
        agentIdentifier: "planner",
        taskInput: "Plan work.",
        executeNow: true,
      },
      result,
    });

    expect(content).toContain('If execution.status is "completed"');
    expect(content).toContain(
      "use execution.response as the actual child-agent result",
    );
    expect(content).toContain("Current execution.status: completed");
    expect(content).toContain("Subagent plan ready.");
  });

  it("incluye guía específica cuando agent.spawn failed trae error", () => {
    const result: ToolExecutionResult = {
      ok: true,
      result: {
        execution: {
          status: "failed",
          error: "Ollama failed.",
        },
      },
    };

    const content = buildToolResultContent({
      toolName: "agent.spawn",
      input: {
        agentIdentifier: "planner",
        taskInput: "Plan work.",
        executeNow: true,
      },
      result,
    });

    expect(content).toContain('If execution.status is "failed"');
    expect(content).toContain("report the returned execution.error");
    expect(content).toContain("Current execution.status: failed");
    expect(content).toContain("Ollama failed.");
  });

  it("buildToolResultMessage devuelve rol user para reinyectar al modelo", () => {
    const message = buildToolResultMessage({
      toolName: "test.echo",
      result: {
        ok: true,
        result: {
          value: "ok",
        },
      },
    });

    expect(message.role).toBe("user");
    expect(message.content).toContain("<tool_result>");
  });

  it("incluye guía específica cuando agent.run_background_task completed", () => {
    const result: ToolExecutionResult = {
      ok: true,
      result: {
        execution: {
          status: "completed",
          response: "Background task done.",
          model: "gemma4:e4b",
        },
      },
    };

    const content = buildToolResultContent({
      toolName: "agent.run_background_task",
      input: {
        backgroundTaskId: "agent_background_task_test",
      },
      result,
    });

    expect(content).toContain("Agent background task result handling:");
    expect(content).toContain('If execution.status is "completed"');
    expect(content).toContain(
      "use execution.response as the actual background subagent result",
    );
    expect(content).toContain("Current execution.status: completed");
    expect(content).toContain("Background task done.");
  });

  it("incluye guía específica cuando agent.inspect_children devuelve hijos", () => {
    const result: ToolExecutionResult = {
      ok: true,
      result: {
        parentSessionId: "session-parent",
        count: 1,
        summary:
          "Parent session session-parent has 1 child subagent task(s).\n\nChild 1:\n- agentIdentifier: planner-bg-test\n- instance.status: completed\n- task.status: completed\n- background.status: completed\n- with persisted result\n- with 3 transcript entrie(s)",
        children: [
          {
            agentIdentifier: "planner-bg-test",
            instanceId: "agent_instance_test",
            taskId: "agent_task_test",
            status: {
              instance: "completed",
              task: "completed",
              background: "completed",
            },
            result: "Plan ready.",
            error: null,
            transcript: [
              {
                role: "system",
                content: "System prompt.",
              },
              {
                role: "user",
                content: "Plan work.",
              },
              {
                role: "assistant",
                content: "Plan ready.",
              },
            ],
          },
        ],
      },
    };

    const content = buildToolResultContent({
      toolName: "agent.inspect_children",
      input: {
        includeTranscript: true,
      },
      result,
    });

    expect(content).toContain("Agent child inspection readable result:");
    expect(content).toContain("Answering rule:");
    expect(content).toContain(
      "Base the user-facing answer on the readable result above.",
    );
    expect(content).toContain(
      "Do not summarize this as a generic process execution.",
    );

    expect(content).toContain("Agent child inspection result handling:");
    expect(content).toContain(
      "This tool result is the ground truth for parent-child subagent coordination.",
    );
    expect(content).toContain(
      "Do not invent users, conversations, dates, external tools, APIs, files, commands, or business data",
    );

    expect(content).toContain(
      "Parent session session-parent has 1 child subagent task(s).",
    );
    expect(content).toContain("Plan ready.");
  });
});