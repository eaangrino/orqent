import { readFile } from "node:fs/promises";
import meow from "meow";
import {
  getOllamaConfigFilePath,
  saveOllamaConfig,
} from "./models/ollama/storage.js";
import { DEFAULT_OLLAMA_CONFIG } from "./models/ollama/config.js";

const helpText = `
  Usage
    $ orqent
    $ orqent resume <sessionId>

  Options
    --help     Mostrar ayuda
    --version  Mostrar versión
    --reset    Reiniciar la configuración persistida

  Examples
    $ orqent
    $ orqent resume session_00000000000000_00000000-0000-0000-0000-000000000000
    $ orqent --reset
`;

type RunAppOptions = {
  resumeSessionId?: string;
};

type CliDeps = {
  argv?: string[];
  packageVersion?: string;
  runAppImpl?: (options?: RunAppOptions) => void | Promise<void>;
  resetStateImpl?: () => Promise<void>;
  logImpl?: (message: string) => void;
};

async function readPackageVersion() {
  try {
    const packageJsonUrl = new URL("../package.json", import.meta.url);
    const raw = await readFile(packageJsonUrl, "utf8");
    const parsed = JSON.parse(raw) as { version?: string };

    return parsed.version?.trim() || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function resetPersistedConfig() {
  await saveOllamaConfig(DEFAULT_OLLAMA_CONFIG);
}

export async function runCli(deps: CliDeps = {}) {
  const argv = deps.argv ?? process.argv.slice(2);
  const packageVersion = deps.packageVersion ?? (await readPackageVersion());
  const resetStateImpl = deps.resetStateImpl ?? resetPersistedConfig;
  const logImpl = deps.logImpl ?? console.log;

  const cli = meow(helpText, {
    importMeta: import.meta,
    argv,
    autoHelp: false,
    autoVersion: false,
    flags: {
      help: {
        type: "boolean",
        default: false,
      },
      version: {
        type: "boolean",
        default: false,
      },
      reset: {
        type: "boolean",
        default: false,
      },
    },
  });

  const [ command, value ] = cli.input;

  if (command === "resume") {
    const resumeSessionId = value?.trim();

    if (!resumeSessionId) {
      logImpl("Using: orqent resume <sessionId>");
      return;
    }

    if (deps.runAppImpl) {
      await deps.runAppImpl({ resumeSessionId });
      return;
    }

    const { runApp } = await import("./run-app.js");
    runApp({ resumeSessionId });
    return;
  }

  if (cli.flags.help) {
    logImpl(helpText.trim());
    return;
  }

  if (cli.flags.version) {
    logImpl(packageVersion);
    return;
  }

  if (cli.flags.reset) {
    await resetStateImpl();
    logImpl(`Configuración reiniciada: ${getOllamaConfigFilePath()}`);
    return;
  }

  if (deps.runAppImpl) {
    await deps.runAppImpl();
    return;
  }

  const { runApp } = await import("./run-app.js");
  runApp();
}
