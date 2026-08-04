#!/usr/bin/env node
import { stat } from "node:fs/promises";
import { stdout, stderr } from "node:process";
import { loadConfig, parseCliOptions } from "./config.js";
import { createOpenAIClient } from "./openai/client.js";
import { createSession, SessionStore } from "./session/store.js";
import { createBuiltinToolRegistry } from "./tools/index.js";
import { HELP_TEXT } from "./cli/help.js";
import { runInteractiveRepl, runOnce } from "./cli/repl.js";

const VERSION = "2.0.1";

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  if (options.help) {
    stdout.write(HELP_TEXT);
    return;
  }
  if (options.version) {
    stdout.write(`${VERSION}\n`);
    return;
  }

  const config = loadConfig(options);
  const info = await stat(config.cwd);
  if (!info.isDirectory()) throw new Error(`El workspace no es un directorio: ${config.cwd}`);

  const store = new SessionStore(config.dataDir);
  const session = options.sessionId
    ? await store.load(options.sessionId)
    : createSession(config.cwd, config.model);

  // La configuración explícita de la ejecución manda sobre metadata antigua.
  session.cwd = config.cwd;
  session.model = config.model;
  await store.save(session);

  const context = {
    config,
    client: createOpenAIClient(config),
    registry: createBuiltinToolRegistry(),
    store,
    session,
  };

  if (options.once) {
    const answer = await runOnce(options.once, context);
    stdout.write(`${answer}\n`);
    return;
  }

  await runInteractiveRepl(context);
}

main().catch((error: unknown) => {
  stderr.write(`[fatal] ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
