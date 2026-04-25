import type {
  OllamaConfig,
  OllamaGenerationOptions,
} from "./types.js";

export const DEFAULT_OLLAMA_HOST = "http://localhost:11434";

export const DEFAULT_OLLAMA_GENERATION_OPTIONS: OllamaGenerationOptions = {
  temperature: 0.7, //1
  topP: 0.9, //0.95
  topK: 40, //64
  numCtx: 8192, // low: 4096, medium: 8,192, high: 16,384, xhigh: 32,768, extreme: 65,536, insane: 131,072
  numPredict: 2048,
  repeatPenalty: 1.1,
};

export const DEFAULT_OLLAMA_CONFIG: OllamaConfig = {
  host: DEFAULT_OLLAMA_HOST,
  selectedModel: "gemma4:e4b",
  generationOptions: DEFAULT_OLLAMA_GENERATION_OPTIONS,
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