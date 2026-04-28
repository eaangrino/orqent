import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { PermissionMode } from "../../security/index.js";
import type { AppView } from "./types.js";

export type AppShellConfig = {
  lastActiveView: AppView;
  permissionMode: PermissionMode;
};

export const DEFAULT_APP_SHELL_CONFIG: AppShellConfig = {
  lastActiveView: "home",
  permissionMode: "ask",
};

function resolveDataDir() {
  const customDir = process.env.ORQENT_DATA_DIR?.trim();

  if (customDir) {
    return customDir;
  }

  return join(homedir(), ".orqent");
}

function resolveAppShellConfigFile() {
  return join(resolveDataDir(), "app-shell-config.json");
}

function normalizeAppView(value: unknown): AppView {
  if (
    value === "home" ||
    value === "config" ||
    value === "model" ||
    value === "params" ||
    value === "thinking" ||
    value === "permissions"
  ) {
    return value;
  }

  return DEFAULT_APP_SHELL_CONFIG.lastActiveView;
}

function normalizePermissionMode(value: unknown): PermissionMode {
  if (value === "ask" || value === "allow" || value === "deny") {
    return value;
  }

  return DEFAULT_APP_SHELL_CONFIG.permissionMode;
}

function normalizeAppShellConfig(value: unknown): AppShellConfig {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return DEFAULT_APP_SHELL_CONFIG;
  }

  const parsed = value as Partial<AppShellConfig>;

  return {
    lastActiveView: normalizeAppView(parsed.lastActiveView),
    permissionMode: normalizePermissionMode(parsed.permissionMode),
  };
}

export async function loadAppShellConfig(): Promise<AppShellConfig> {
  try {
    const raw = await readFile(resolveAppShellConfigFile(), "utf8");
    const parsed = JSON.parse(raw) as unknown;

    return normalizeAppShellConfig(parsed);
  } catch {
    return DEFAULT_APP_SHELL_CONFIG;
  }
}

export async function saveAppShellConfig(
  config: Partial<AppShellConfig>,
): Promise<void> {
  const configFile = resolveAppShellConfigFile();

  await mkdir(dirname(configFile), { recursive: true });

  await writeFile(
    configFile,
    JSON.stringify(
      normalizeAppShellConfig({
        ...DEFAULT_APP_SHELL_CONFIG,
        ...config,
      }),
      null,
      2,
    ),
    "utf8",
  );
}

export function getAppShellConfigFilePath() {
  return resolveAppShellConfigFile();
}