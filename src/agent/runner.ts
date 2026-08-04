import type { AppConfig } from "../config.js";
import type {
  OpenAIResponseLike,
  ResponseFunctionCallOutput,
  ResponseInputItem,
  ResponsesClient,
} from "./protocol.js";
import { isFunctionCall } from "./protocol.js";
import type { ToolConfirmationRequest } from "../tools/types.js";
import type { ToolRegistry } from "../tools/registry.js";
import { buildSystemPrompt } from "./system-prompt.js";

export type AgentRunCallbacks = {
  confirmTool: (request: ToolConfirmationRequest) => Promise<boolean>;
  onStatus?: (status: string) => void;
  onToolCall?: (event: {
    name: string;
    callId: string;
    arguments: unknown;
  }) => void;
  onToolResult?: (event: {
    name: string;
    callId: string;
    result: unknown;
  }) => void;
  onInputChanged?: (input: ResponseInputItem[]) => Promise<void> | void;
};

export type AgentRunInput = {
  client: ResponsesClient;
  registry: ToolRegistry;
  config: AppConfig;
  history: ResponseInputItem[];
  prompt: string;
  callbacks: AgentRunCallbacks;
  signal?: AbortSignal;
};

export type AgentRunResult = {
  text: string;
  history: ResponseInputItem[];
  rounds: number;
  toolCalls: number;
  responseId: string | null;
  requestId: string | null;
};

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({
      ok: false,
      error: {
        code: "serialization_failed",
        message: "El resultado de la tool no pudo serializarse.",
      },
    });
  }
}

function extractTextFromOutput(response: OpenAIResponseLike): string {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const parts: string[] = [];
  for (const item of response.output) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (typeof content !== "object" || content === null) continue;
      const record = content as Record<string, unknown>;
      if (
        (record.type === "output_text" || record.type === "text") &&
        typeof record.text === "string"
      ) {
        parts.push(record.text);
      }
    }
  }
  return parts.join("\n").trim();
}

function parseArguments(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(
      `La tool devolvió argumentos JSON inválidos: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function createLinkedAbortController(parent?: AbortSignal): AbortController {
  const controller = new AbortController();
  if (!parent) return controller;
  if (parent.aborted) {
    controller.abort(parent.reason);
    return controller;
  }
  parent.addEventListener("abort", () => controller.abort(parent.reason), {
    once: true,
  });
  return controller;
}

export async function runAgentTurn(input: AgentRunInput): Promise<AgentRunResult> {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("El prompt está vacío.");

  const history: ResponseInputItem[] = [
    ...input.history,
    { role: "user", content: prompt },
  ];
  await input.callbacks.onInputChanged?.(history);

  const tools = input.registry.toResponseTools(input.config.strictTools);
  const instructions = buildSystemPrompt(input.config.cwd, input.registry);
  let toolCalls = 0;
  let lastResponseId: string | null = null;
  let lastRequestId: string | null = null;

  for (let round = 1; round <= input.config.maxToolRounds + 1; round += 1) {
    input.callbacks.onStatus?.(
      round === 1 ? "Consultando modelo..." : `Continuando después de tools (ronda ${round})...`,
    );

    if (input.config.debug) {
      process.stderr.write(
        `[debug] request round=${round} model=${input.config.model} inputItems=${history.length} tools=${tools.length}\n`,
      );
    }

    const response = await input.client.responses.create({
      model: input.config.model,
      instructions,
      input: history,
      tools,
    });

    lastResponseId = typeof response.id === "string" ? response.id : null;
    lastRequestId =
      typeof response._request_id === "string" ? response._request_id : null;

    // Invariante crítica: se preserva TODO response.output y en el mismo orden.
    // Filtrar solo mensajes rompe reasoning/function_call y causa olvidos o errores.
    history.push(...input.client.toInputItems(response.output));
    await input.callbacks.onInputChanged?.(history);

    const functionCalls = response.output.filter(isFunctionCall);
    if (functionCalls.length === 0) {
      const text = extractTextFromOutput(response);
      return {
        text: text || "(respuesta vacía del modelo)",
        history,
        rounds: round,
        toolCalls,
        responseId: lastResponseId,
        requestId: lastRequestId,
      };
    }

    if (round > input.config.maxToolRounds) {
      throw new Error(
        `Se alcanzó el límite de ${input.config.maxToolRounds} rondas de tools.`,
      );
    }

    for (const call of functionCalls) {
      toolCalls += 1;
      let parsedArguments: unknown;
      let result: unknown;

      try {
        parsedArguments = parseArguments(call.arguments);
        input.callbacks.onToolCall?.({
          name: call.name,
          callId: call.call_id,
          arguments: parsedArguments,
        });

        const controller = createLinkedAbortController(input.signal);
        result = await input.registry.execute(call.name, parsedArguments, {
          rootDir: input.config.cwd,
          permissionMode: input.config.permissionMode,
          signal: controller.signal,
          maxOutputBytes: input.config.maxToolOutputBytes,
          confirm: input.callbacks.confirmTool,
        });
      } catch (error) {
        parsedArguments = { raw: call.arguments };
        result = {
          ok: false,
          error: {
            code: "invalid_tool_call",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }

      input.callbacks.onToolResult?.({
        name: call.name,
        callId: call.call_id,
        result,
      });

      const output: ResponseFunctionCallOutput = {
        type: "function_call_output",
        call_id: call.call_id,
        output: safeJson(result),
      };
      history.push(output);
      await input.callbacks.onInputChanged?.(history);
    }
  }

  throw new Error("El loop del agente terminó en un estado imposible.");
}
