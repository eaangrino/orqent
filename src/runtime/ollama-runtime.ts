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