import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  DEFAULT_OLLAMA_CONFIG,
  normalizeOllamaHost,
} from "./config.js";
import type { OllamaConfig } from "./types.js";

type PersistedOllamaConfig = Partial<OllamaConfig>;

function resolveDataDir() {
  const customDir = process.env.ORQENT_DATA_DIR?.trim();

  if (customDir) {
    return customDir;
  }

  return join(homedir(), ".orqent");
}

function resolveOllamaConfigFile() {
  return join(resolveDataDir(), "ollama-config.json");
}

function normalizePersistedConfig(
  parsed: PersistedOllamaConfig,
): OllamaConfig {
  const host =
    typeof parsed.host === "string"
      ? normalizeOllamaHost(parsed.host)
      : DEFAULT_OLLAMA_CONFIG.host;

  const selectedModel =
    typeof parsed.selectedModel === "string" && parsed.selectedModel.trim()
      ? parsed.selectedModel.trim()
      : DEFAULT_OLLAMA_CONFIG.selectedModel;

  return {
    host,
    selectedModel,
  };
}

export async function loadOllamaConfig(): Promise<OllamaConfig> {
  try {
    const raw = await readFile(resolveOllamaConfigFile(), "utf8");
    const parsed = JSON.parse(raw) as PersistedOllamaConfig;

    return normalizePersistedConfig(parsed);
  } catch {
    return DEFAULT_OLLAMA_CONFIG;
  }
}

export async function saveOllamaConfig(config: OllamaConfig): Promise<void> {
  const configFile = resolveOllamaConfigFile();

  await mkdir(dirname(configFile), { recursive: true });

  await writeFile(
    configFile,
    JSON.stringify(normalizePersistedConfig(config), null, 2),
    "utf8",
  );
}

export function getOllamaConfigFilePath() {
  return resolveOllamaConfigFile();
}