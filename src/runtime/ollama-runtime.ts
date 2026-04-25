import { createOllamaClient } from "../models/ollama/client.js";
import type {
  OllamaGenerationOptions,
  OllamaThinkingMode,
} from "../models/ollama/types.js";

export type SendPromptToOllamaInput = {
  host: string;
  model: string;
  prompt: string;
};

export type SendPromptToOllamaResult = {
  model: string;
  response: string;
};

export type StreamPromptToOllamaInput = SendPromptToOllamaInput & {
  onToken: (token: string) => void;
};

export type OllamaChatRole = "system" | "user" | "assistant";

export type OllamaChatMessage = {
  role: OllamaChatRole;
  content: string;
};

export type CompactChatHistoryInput = {
  host: string;
  model: string;
  previousSummary: string | null;
  messages: OllamaChatMessage[];
  generationOptions?: OllamaGenerationOptions;
};

export type StreamChatFromOllamaInput = {
  host: string;
  model: string;
  messages: OllamaChatMessage[];
  generationOptions?: OllamaGenerationOptions;
  thinkingMode?: OllamaThinkingMode;
  onToken: (token: string) => void;
};

function toOllamaRequestOptions(
  generationOptions: OllamaGenerationOptions | undefined,
) {
  if (!generationOptions) {
    return undefined;
  }

  return {
    temperature: generationOptions.temperature,
    top_p: generationOptions.topP,
    top_k: generationOptions.topK,
    num_ctx: generationOptions.numCtx,
    num_predict: generationOptions.numPredict,
    repeat_penalty: generationOptions.repeatPenalty,
  };
}

function toOllamaThinkOption(
  thinkingMode: OllamaThinkingMode | undefined,
): boolean | "low" | "medium" | "high" | undefined {
  switch (thinkingMode) {
    case "disabled":
      return false;

    case "enabled":
      return true;

    case "low":
    case "medium":
    case "high":
      return thinkingMode;

    case "default":
    case undefined:
      return undefined;
  }
}

export async function sendPromptToOllama({
  host,
  model,
  prompt,
}: SendPromptToOllamaInput): Promise<SendPromptToOllamaResult> {
  const normalizedPrompt = prompt.trim();

  if (!normalizedPrompt) {
    throw new Error("El prompt no puede estar vacío.");
  }

  if (!model.trim()) {
    throw new Error("No hay modelo seleccionado.");
  }

  const client = createOllamaClient(host);

  const result = await client.generate({
    model,
    prompt: normalizedPrompt,
    stream: false,
  });

  return {
    model: result.model,
    response: result.response,
  };
}

export async function streamPromptFromOllama({
  host,
  model,
  prompt,
  onToken,
}: StreamPromptToOllamaInput): Promise<SendPromptToOllamaResult> {
  const normalizedPrompt = prompt.trim();

  if (!normalizedPrompt) {
    throw new Error("El prompt no puede estar vacío.");
  }

  if (!model.trim()) {
    throw new Error("No hay modelo seleccionado.");
  }

  const client = createOllamaClient(host);

  const stream = await client.generate({
    model,
    prompt: normalizedPrompt,
    stream: true,
  });

  let response = "";
  let responseModel = model;

  for await (const part of stream) {
    if (part.model) {
      responseModel = part.model;
    }

    if (part.response) {
      response += part.response;
      onToken(part.response);
    }
  }

  return {
    model: responseModel,
    response,
  };
}

export async function streamChatFromOllama({
  host,
  model,
  messages,
  generationOptions,
  thinkingMode,
  onToken,
}: StreamChatFromOllamaInput): Promise<SendPromptToOllamaResult> {
  if (!model.trim()) {
    throw new Error("No hay modelo seleccionado.");
  }

  const normalizedMessages = messages
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter((message) => message.content.length > 0);

  if (normalizedMessages.length === 0) {
    throw new Error("No hay mensajes para enviar a Ollama.");
  }

  const client = createOllamaClient(host);

  const stream = await client.chat({
    model,
    messages: normalizedMessages,
    options: toOllamaRequestOptions(generationOptions),
    think: toOllamaThinkOption(thinkingMode),
    stream: true,
  });

  let response = "";
  let responseModel = model;

  for await (const part of stream) {
    if (part.model) {
      responseModel = part.model;
    }

    const token = part.message?.content ?? "";

    if (token) {
      response += token;
      onToken(token);
    }
  }

  return {
    model: responseModel,
    response,
  };
}

export async function compactChatHistoryWithOllama({
  host,
  model,
  previousSummary,
  messages,
  generationOptions,
}: CompactChatHistoryInput): Promise<string> {
  if (!model.trim()) {
    throw new Error("No hay modelo seleccionado.");
  }

  const compactableMessages = messages
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter((message) => message.content.length > 0);

  if (compactableMessages.length === 0) {
    return previousSummary ?? "";
  }

  const client = createOllamaClient(host);

  const transcript = compactableMessages
    .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
    .join("\n\n");

  const previousSummarySection = previousSummary
    ? `Preview summary:\n${previousSummary}\n\n`
    : "";

  const response = await client.chat({
    model,
    stream: false,
    options: toOllamaRequestOptions(generationOptions),
    messages: [
      {
        role: "system",
        content:
          "Summarize the conversation to preserve useful context for future turns. " +
          "Write the summary in the same language as the conversation being summarized. " +
          "Preserve user preferences, technical decisions, project state, relevant errors, pending tasks, and important file names or commands. " +
          "Do not invent information. Respond only with the updated summary.",
      },
      {
        role: "user",
        content: `${previousSummarySection}New messages to compact:\n${transcript}`,
      },
    ],
  });

  return response.message.content.trim();
}