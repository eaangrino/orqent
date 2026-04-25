import { Ollama } from "ollama";
import { normalizeOllamaHost } from "./config.js";

export function createOllamaClient(host: string) {
  return new Ollama({
    host: normalizeOllamaHost(host),
  });
}