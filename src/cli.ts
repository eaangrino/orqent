import { readFile } from 'node:fs/promises';
import meow from 'meow';
import { getStateFilePath, resetState } from './lib/storage.js';

const helpText = `
  Usage
    $ orqent

  Options
    --help     Mostrar ayuda
    --version  Mostrar versión
    --reset    Reiniciar el estado persistido

  Examples
    $ orqent
    $ orqent --reset
`;

type CliDeps = {
  argv?: string[];
  packageVersion?: string;
  runAppImpl?: () => void | Promise<void>;
  resetStateImpl?: () => Promise<void>;
  logImpl?: (message: string) => void;
};

async function readPackageVersion() {
  try {
    const packageJsonUrl = new URL('../package.json', import.meta.url);
    const raw = await readFile(packageJsonUrl, 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };

    return parsed.version?.trim() || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export async function runCli(deps: CliDeps = {}) {
  const argv = deps.argv ?? process.argv.slice(2);
  const packageVersion = deps.packageVersion ?? (await readPackageVersion());
  const resetStateImpl = deps.resetStateImpl ?? resetState;
  const logImpl = deps.logImpl ?? console.log;

  const cli = meow(helpText, {
    importMeta: import.meta,
    argv,
    autoHelp: false,
    autoVersion: false,
    flags: {
      help: {
        type: 'boolean',
        default: false,
      },
      version: {
        type: 'boolean',
        default: false,
      },
      reset: {
        type: 'boolean',
        default: false,
      },
    },
  });

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
    logImpl(`Estado reiniciado: ${getStateFilePath()}`);
    return;
  }

  if (deps.runAppImpl) {
    await deps.runAppImpl();
    return;
  }

  const { runApp } = await import('./run-app.js');
  runApp();
}
