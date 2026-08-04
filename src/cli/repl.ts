import { createInterface, type Interface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { AppConfig, PermissionMode } from "../config.js";
import { runAgentTurn } from "../agent/runner.js";
import type { ResponsesClient } from "../agent/protocol.js";
import { createSession, type SessionState, SessionStore } from "../session/store.js";
import type { ToolConfirmationRequest } from "../tools/types.js";
import type { ToolRegistry } from "../tools/registry.js";
import { HELP_TEXT } from "./help.js";

export type ReplContext = {
  config: AppConfig;
  client: ResponsesClient;
  registry: ToolRegistry;
  store: SessionStore;
  session: SessionState;
};

function compactJson(value: unknown, maxLength = 1_500): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(value, null, 2);
  } catch {
    serialized = String(value);
  }
  return serialized.length <= maxLength
    ? serialized
    : `${serialized.slice(0, maxLength)}\n...[truncado]`;
}

async function confirmTool(
  rl: Interface,
  request: ToolConfirmationRequest,
): Promise<boolean> {
  stdout.write(`\n[confirmación] ${request.name} (${request.risk})\n`);
  stdout.write(`${request.description}\n`);
  stdout.write(`${compactJson(request.arguments)}\n`);
  const answer = (await rl.question("¿Ejecutar? [y/N] ")).trim().toLowerCase();
  return answer === "y" || answer === "yes" || answer === "s" || answer === "sí";
}

export async function executePrompt(
  prompt: string,
  context: ReplContext,
  rl: Interface,
): Promise<string> {
  const result = await runAgentTurn({
    client: context.client,
    registry: context.registry,
    config: context.config,
    history: context.session.input,
    prompt,
    callbacks: {
      confirmTool: (request) => confirmTool(rl, request),
      onStatus: (status) => {
        if (context.config.debug) stdout.write(`[estado] ${status}\n`);
      },
      onToolCall: (event) => {
        stdout.write(`\n[tool →] ${event.name}\n`);
        if (context.config.debug) stdout.write(`${compactJson(event.arguments)}\n`);
      },
      onToolResult: (event) => {
        const resultRecord =
          typeof event.result === "object" && event.result !== null
            ? (event.result as Record<string, unknown>)
            : null;
        const status = resultRecord?.ok === true ? "ok" : "error";
        stdout.write(`[tool ← ${status}] ${event.name}\n`);
        if (context.config.debug) stdout.write(`${compactJson(event.result)}\n`);
      },
      onInputChanged: async (history) => {
        context.session.input = [...history];
        context.session.cwd = context.config.cwd;
        context.session.model = context.config.model;
        await context.store.save(context.session);
      },
    },
  });

  context.session.input = [...result.history];
  context.session.model = context.config.model;
  context.session.cwd = context.config.cwd;
  await context.store.save(context.session);
  return result.text;
}

function parsePermissionMode(value: string): PermissionMode | null {
  return value === "ask" || value === "auto" || value === "read-only"
    ? value
    : null;
}

async function handleCommand(
  line: string,
  context: ReplContext,
): Promise<"continue" | "exit"> {
  const [command = "", ...args] = line.trim().split(/\s+/);
  const value = args.join(" ").trim();

  switch (command.toLowerCase()) {
    case "/help":
      stdout.write(`${HELP_TEXT}\n`);
      return "continue";
    case "/tools":
      stdout.write("\n");
      for (const tool of context.registry.list()) {
        stdout.write(`- ${tool.name} [${tool.risk}]: ${tool.description}\n`);
      }
      stdout.write("\n");
      return "continue";
    case "/session":
      stdout.write(
        `${compactJson({
          id: context.session.id,
          model: context.config.model,
          cwd: context.config.cwd,
          input_items: context.session.input.length,
          permission: context.config.permissionMode,
          file: context.store.pathFor(context.session.id),
        })}\n`,
      );
      return "continue";
    case "/new": {
      context.session = createSession(context.config.cwd, context.config.model);
      await context.store.save(context.session);
      stdout.write(`Nueva sesión: ${context.session.id}\n`);
      return "continue";
    }
    case "/clear":
      context.session.input = [];
      await context.store.save(context.session);
      stdout.write("Historial de la sesión borrado.\n");
      return "continue";
    case "/model":
      if (!value) {
        stdout.write(`Modelo actual: ${context.config.model}\n`);
        return "continue";
      }
      context.config.model = value;
      context.session.model = value;
      await context.store.save(context.session);
      stdout.write(`Modelo cambiado a: ${value}\n`);
      return "continue";
    case "/permission": {
      if (!value) {
        stdout.write(`Modo actual: ${context.config.permissionMode}\n`);
        return "continue";
      }
      const mode = parsePermissionMode(value);
      if (!mode) {
        stdout.write("Modo inválido. Use ask, auto o read-only.\n");
        return "continue";
      }
      context.config.permissionMode = mode;
      stdout.write(`Modo de permisos: ${mode}\n`);
      return "continue";
    }
    case "/exit":
    case "/quit":
      return "exit";
    default:
      stdout.write(`Comando desconocido: ${command}. Use /help.\n`);
      return "continue";
  }
}

export async function runInteractiveRepl(context: ReplContext): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  stdout.write("Orqent 2.0.1 · OpenAI SDK Responses API · /help\n");
  stdout.write(`Modelo: ${context.config.model}\n`);
  stdout.write(`Workspace: ${context.config.cwd}\n`);
  stdout.write(`Sesión: ${context.session.id}\n\n`);

  try {
    while (true) {
      const line = (await rl.question("tú> ")).trim();
      if (!line) continue;
      if (line.startsWith("/")) {
        if ((await handleCommand(line, context)) === "exit") break;
        continue;
      }

      try {
        const text = await executePrompt(line, context, rl);
        stdout.write(`\norqent> ${text}\n\n`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stdout.write(`\n[error] ${message}\n\n`);
      }
    }
  } finally {
    rl.close();
  }
}

export async function runOnce(
  prompt: string,
  context: ReplContext,
): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return await executePrompt(prompt, context, rl);
  } finally {
    rl.close();
  }
}
