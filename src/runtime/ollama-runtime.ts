import { createOllamaClient } from "../models/ollama/client.js";

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
};

export type StreamChatFromOllamaInput = {
  host: string;
  model: string;
  messages: OllamaChatMessage[];
  onToken: (token: string) => void;
};

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
    ? `Resumen previo:\n${previousSummary}\n\n`
    : "";

  const response = await client.chat({
    model,
    stream: false,
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