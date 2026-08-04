import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createOpenAIClient } from "../src/openai/client.js";
import type { AppConfig } from "../src/config.js";

async function readBody(request: import("node:http").IncomingMessage): Promise<string> {
  let body = "";
  request.setEncoding("utf8");
  for await (const chunk of request) body += chunk;
  return body;
}

test("el cliente oficial envía una petición Responses API válida", async () => {
  let received: unknown = null;
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/responses") {
      response.writeHead(404).end();
      return;
    }

    received = JSON.parse(await readBody(request)) as Record<string, unknown>;
    response.writeHead(200, {
      "content-type": "application/json",
      "x-request-id": "req_local_test",
    });
    response.end(JSON.stringify({
      id: "resp_local_test",
      object: "response",
      created_at: 0,
      status: "completed",
      error: null,
      incomplete_details: null,
      instructions: null,
      max_output_tokens: null,
      model: "fake-model",
      output: [],
      parallel_tool_calls: true,
      previous_response_id: null,
      reasoning: null,
      store: false,
      temperature: 1,
      text: { format: { type: "text" } },
      tool_choice: "auto",
      tools: [],
      top_p: 1,
      truncation: "disabled",
      usage: null,
      user: null,
      metadata: {},
      output_text: "ok",
    }));
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address() as AddressInfo;
    const config: AppConfig = {
      baseURL: `http://127.0.0.1:${address.port}/v1`,
      apiKey: "ollama",
      model: "fake-model",
      cwd: process.cwd(),
      dataDir: ".orqent-test",
      permissionMode: "read-only",
      requestTimeoutMs: 10_000,
      maxToolRounds: 1,
      maxToolOutputBytes: 10_000,
      strictTools: true,
      debug: false,
    };

    const client = createOpenAIClient(config);
    const result = await client.responses.create({
      model: "fake-model",
      instructions: "test",
      input: [{ role: "user", content: "hola" }],
      tools: [],
    });

    assert.equal(result.id, "resp_local_test");
    assert.ok(received && typeof received === "object");
    const body = received as Record<string, unknown>;
    assert.equal(body.model, "fake-model");
    assert.deepEqual(body.input, [{ role: "user", content: "hola" }]);
    assert.deepEqual(body.tools, []);
  } finally {
    server.close();
    await once(server, "close");
  }
});
