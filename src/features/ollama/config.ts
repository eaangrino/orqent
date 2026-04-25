import type { OllamaConfig } from "./types.js";

export const DEFAULT_OLLAMA_HOST = "http://localhost:11434";

export const DEFAULT_OLLAMA_CONFIG: OllamaConfig = {
  host: DEFAULT_OLLAMA_HOST,
  selectedModel: "gemma4:e4b",
};

export function normalizeOllamaHost(rawValue: string): string {
  const value = rawValue.trim();

  if (!value) {
    return DEFAULT_OLLAMA_HOST;
  }

  const withoutTrailingSlashes = value.replace(/\/+$/, "");

  if (withoutTrailingSlashes.endsWith("/api")) {
    return withoutTrailingSlashes.slice(0, -4);
  }

  return withoutTrailingSlashes;
}