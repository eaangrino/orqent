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