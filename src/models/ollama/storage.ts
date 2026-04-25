import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  DEFAULT_OLLAMA_CONFIG,
  DEFAULT_OLLAMA_GENERATION_OPTIONS,
  normalizeOllamaHost,
} from "./config.js";
import type { OllamaConfig, OllamaGenerationOptions } from "./types.js";

type PersistedOllamaConfig = Partial<Omit<OllamaConfig, "generationOptions">> & {
  generationOptions?: Partial<OllamaGenerationOptions>;
};

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

function normalizeGenerationNumber(
  value: unknown,
  fallback: number,
  options: {
    min: number;
    max: number;
    integer?: boolean;
  },
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  const clamped = Math.min(options.max, Math.max(options.min, value));

  return options.integer ? Math.round(clamped) : clamped;
}

function normalizeGenerationOptions(
  parsed: Partial<OllamaGenerationOptions> | undefined,
): OllamaGenerationOptions {
  return {
    temperature: normalizeGenerationNumber(
      parsed?.temperature,
      DEFAULT_OLLAMA_GENERATION_OPTIONS.temperature,
      { min: 0, max: 2 },
    ),
    topP: normalizeGenerationNumber(
      parsed?.topP,
      DEFAULT_OLLAMA_GENERATION_OPTIONS.topP,
      { min: 0, max: 1 },
    ),
    topK: normalizeGenerationNumber(
      parsed?.topK,
      DEFAULT_OLLAMA_GENERATION_OPTIONS.topK,
      { min: 1, max: 200, integer: true },
    ),
    numCtx: normalizeGenerationNumber(
      parsed?.numCtx,
      DEFAULT_OLLAMA_GENERATION_OPTIONS.numCtx,
      { min: 512, max: 262144, integer: true },
    ),
    numPredict: normalizeGenerationNumber(
      parsed?.numPredict,
      DEFAULT_OLLAMA_GENERATION_OPTIONS.numPredict,
      { min: 1, max: 32768, integer: true },
    ),
    repeatPenalty: normalizeGenerationNumber(
      parsed?.repeatPenalty,
      DEFAULT_OLLAMA_GENERATION_OPTIONS.repeatPenalty,
      { min: 0.5, max: 2 },
    ),
  };
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
    generationOptions: normalizeGenerationOptions(parsed.generationOptions),
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