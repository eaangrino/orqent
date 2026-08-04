import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runAgentTurn } from "../src/agent/runner.js";
import type {
  OpenAIResponseLike,
  ResponsesClient,
  ResponsesCreateParams,
} from "../src/agent/protocol.js";
import type { AppConfig } from "../src/config.js";
import { createBuiltinToolRegistry } from "../src/tools/index.js";

function config(cwd: string): AppConfig {
  return {
    baseURL: "http://127.0.0.1:11434/v1",
    apiKey: "ollama",
    model: "fake-model",
    cwd,
    dataDir: join(cwd, ".orqent"),
    permissionMode: "auto",
    requestTimeoutMs: 30_000,
    maxToolRounds: 4,
    maxToolOutputBytes: 20_000,
    strictTools: true,
    debug: false,
  };
}

class FakeResponsesClient implements ResponsesClient {
  readonly requests: ResponsesCreateParams[] = [];
  #responses: OpenAIResponseLike[];

  constructor(responses: OpenAIResponseLike[]) {
    this.#responses = responses;
  }

  responses = {
    create: async (params: ResponsesCreateParams): Promise<OpenAIResponseLike> => {
      this.requests.push(structuredClone(params));
      const response = this.#responses.shift();
      if (!response) throw new Error("No fake response configured.");
      return response;
    },
  };

  toInputItems(output: Array<Record<string, unknown>>) {
    return structuredClone(output);
  }
}

test("preserva function_call/output y reenvía el catálogo completo en cada ronda", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "orqent-agent-"));
  try {
    await writeFile(join(cwd, "hello.txt"), "uno\ndos\ntres\n", "utf8");
    const firstCall = {
      type: "function_call",
      id: "fc_1",
      call_id: "call_1",
      name: "fs_read",
      arguments: JSON.stringify({
        path: "hello.txt",
        start_line: 1,
        end_line: 2,
      }),
      status: "completed",
    };
    const client = new FakeResponsesClient([
      { id: "r1", output: [firstCall], output_text: "" },
      {
        id: "r2",
        output_text: "El archivo empieza con uno y dos.",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: "El archivo empieza con uno y dos.",
              },
            ],
          },
        ],
      },
    ]);

    const result = await runAgentTurn({
      client,
      registry: createBuiltinToolRegistry(),
      config: config(cwd),
      history: [],
      prompt: "Lee hello.txt",
      callbacks: { confirmTool: async () => true },
    });

    assert.equal(result.text, "El archivo empieza con uno y dos.");
    assert.equal(result.toolCalls, 1);
    assert.equal(client.requests.length, 2);
    assert.equal(client.requests[0]?.tools.length, 9);
    assert.equal(client.requests[1]?.tools.length, 9);
    assert.deepEqual(client.requests[0]?.tools, client.requests[1]?.tools);

    const secondInput = client.requests[1]?.input ?? [];
    const callIndex = secondInput.findIndex(
      (item) => "type" in item && item.type === "function_call",
    );
    const outputIndex = secondInput.findIndex(
      (item) => "type" in item && item.type === "function_call_output",
    );
    assert.ok(callIndex >= 0);
    assert.equal(outputIndex, callIndex + 1);

    const output = secondInput[outputIndex] as { output: string };
    const parsed = JSON.parse(output.output) as {
      ok: boolean;
      data: { content: string };
    };
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.content, "uno\ndos");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("devuelve un function_call_output de error cuando los argumentos son JSON inválido", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "orqent-agent-"));
  try {
    const client = new FakeResponsesClient([
      {
        id: "r1",
        output: [
          {
            type: "function_call",
            call_id: "call_bad",
            name: "fs_read",
            arguments: "{bad-json",
          },
        ],
      },
      { id: "r2", output: [], output_text: "No pude leerlo." },
    ]);

    const result = await runAgentTurn({
      client,
      registry: createBuiltinToolRegistry(),
      config: config(cwd),
      history: [],
      prompt: "Lee algo",
      callbacks: { confirmTool: async () => true },
    });

    assert.equal(result.text, "No pude leerlo.");
    const output = client.requests[1]?.input.find(
      (item) => "type" in item && item.type === "function_call_output",
    ) as { output: string } | undefined;
    assert.ok(output);
    assert.match(output!.output, /invalid_tool_call/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("maneja varias function calls sin perder el orden ni el catálogo", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "orqent-agent-"));
  try {
    await writeFile(join(cwd, "one.txt"), "uno", "utf8");
    await writeFile(join(cwd, "two.txt"), "dos", "utf8");
    const client = new FakeResponsesClient([
      {
        id: "r1",
        output: [
          {
            type: "function_call",
            call_id: "call_one",
            name: "fs_read",
            arguments: JSON.stringify({
              path: "one.txt",
              start_line: null,
              end_line: null,
            }),
          },
          {
            type: "function_call",
            call_id: "call_two",
            name: "fs_read",
            arguments: JSON.stringify({
              path: "two.txt",
              start_line: null,
              end_line: null,
            }),
          },
        ],
      },
      { id: "r2", output: [], output_text: "Leí ambos archivos." },
    ]);

    const result = await runAgentTurn({
      client,
      registry: createBuiltinToolRegistry(),
      config: config(cwd),
      history: [],
      prompt: "Lee ambos archivos",
      callbacks: { confirmTool: async () => true },
    });

    assert.equal(result.toolCalls, 2);
    assert.deepEqual(client.requests[0]?.tools, client.requests[1]?.tools);

    const items = client.requests[1]?.input ?? [];
    const calls = items.filter(
      (item) => "type" in item && item.type === "function_call",
    ) as Array<{ call_id: string }>;
    const outputs = items.filter(
      (item) => "type" in item && item.type === "function_call_output",
    ) as Array<{ call_id: string; output: string }>;

    assert.deepEqual(calls.map((item) => item.call_id), ["call_one", "call_two"]);
    assert.deepEqual(outputs.map((item) => item.call_id), ["call_one", "call_two"]);
    assert.match(outputs[0]?.output ?? "", /uno/);
    assert.match(outputs[1]?.output ?? "", /dos/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
