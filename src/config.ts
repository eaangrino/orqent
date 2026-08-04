import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";

export type PermissionMode = "ask" | "auto" | "read-only";

export type AppConfig = {
  baseURL: string;
  apiKey: string;
  model: string;
  cwd: string;
  dataDir: string;
  permissionMode: PermissionMode;
  requestTimeoutMs: number;
  maxToolRounds: number;
  maxToolOutputBytes: number;
  strictTools: boolean;
  debug: boolean;
};

export type CliOptions = {
  model?: string;
  baseURL?: string;
  apiKey?: string;
  cwd?: string;
  dataDir?: string;
  permissionMode?: PermissionMode;
  sessionId?: string;
  once?: string;
  debug?: boolean;
  help: boolean;
  version: boolean;
};

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function normalizeBaseURL(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function resolvePath(value: string, base = process.cwd()): string {
  const expanded = value.startsWith("~/")
    ? resolve(homedir(), value.slice(2))
    : value;
  return isAbsolute(expanded) ? resolve(expanded) : resolve(base, expanded);
}

function parsePermissionMode(value: string): PermissionMode {
  if (value === "ask" || value === "auto" || value === "read-only") {
    return value;
  }
  throw new Error(`Modo de permisos inválido: ${value}`);
}

export function parseCliOptions(argv: readonly string[]): CliOptions {
  const options: CliOptions = { help: false, version: false };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument) continue;

    const takeValue = (): string => {
      const value = argv[index + 1];
      if (!value) throw new Error(`Falta el valor para ${argument}`);
      index += 1;
      return value;
    };

    switch (argument) {
      case "--":
        // pnpm/npm pueden reenviar este separador al script.
        break;
      case "--model":
      case "-m":
        options.model = takeValue();
        break;
      case "--base-url":
        options.baseURL = takeValue();
        break;
      case "--api-key":
        options.apiKey = takeValue();
        break;
      case "--cwd":
      case "-C":
        options.cwd = takeValue();
        break;
      case "--data-dir":
        options.dataDir = takeValue();
        break;
      case "--permission":
        options.permissionMode = parsePermissionMode(takeValue());
        break;
      case "--session":
      case "-s":
        options.sessionId = takeValue();
        break;
      case "--once":
      case "-p":
        options.once = takeValue();
        break;
      case "--debug":
        options.debug = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--version":
      case "-v":
        options.version = true;
        break;
      default:
        throw new Error(`Argumento desconocido: ${argument}`);
    }
  }

  return options;
}

export function loadConfig(options: CliOptions): AppConfig {
  const cwd = resolvePath(options.cwd ?? process.env.ORQENT_CWD ?? process.cwd());
  const dataDir = resolvePath(
    options.dataDir ?? process.env.ORQENT_DATA_DIR ?? ".orqent",
    cwd,
  );

  return {
    baseURL: normalizeBaseURL(
      options.baseURL ??
        process.env.ORQENT_BASE_URL ??
        "http://127.0.0.1:11434/v1",
    ),
    apiKey: options.apiKey ?? process.env.ORQENT_API_KEY ?? "ollama",
    model: options.model ?? process.env.ORQENT_MODEL ?? "gemma4:e4b",
    cwd,
    dataDir,
    permissionMode:
      options.permissionMode ??
      parsePermissionMode(process.env.ORQENT_PERMISSION_MODE ?? "ask"),
    requestTimeoutMs: parsePositiveInteger(
      process.env.ORQENT_REQUEST_TIMEOUT_MS,
      180_000,
    ),
    maxToolRounds: parsePositiveInteger(
      process.env.ORQENT_MAX_TOOL_ROUNDS,
      12,
    ),
    maxToolOutputBytes: parsePositiveInteger(
      process.env.ORQENT_MAX_TOOL_OUTPUT_BYTES,
      120_000,
    ),
    strictTools: parseBoolean(process.env.ORQENT_STRICT_TOOLS, true),
    debug: options.debug ?? parseBoolean(process.env.ORQENT_DEBUG, false),
  };
}
