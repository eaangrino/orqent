import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OllamaChatMessage } from "./ollama-runtime.js";

type DumpOllamaChatPayloadInput = {
  sessionId: string;
  model: string;
  cwd: string;
  messages: OllamaChatMessage[];
  generationOptions?: unknown;
  thinkingMode?: unknown;
};

function resolveDebugDir() {
  const customDir = process.env.ORQENT_DATA_DIR?.trim();

  return join(customDir || join(homedir(), ".orqent"), "debug", "prompts");
}

function safeSessionId(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function dumpOllamaChatPayload({
  sessionId,
  model,
  cwd,
  messages,
  generationOptions,
  thinkingMode,
}: DumpOllamaChatPayloadInput): Promise<string | null> {
  if (process.env.ORQENT_DEBUG_PROMPTS !== "1") {
    return null;
  }

  const dir = resolveDebugDir();
  await mkdir(dir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = join(
    dir,
    `${timestamp}_${safeSessionId(sessionId)}.chat.json`,
  );

  const systemMessage = messages.find((message) => message.role === "system");
  const systemContent = systemMessage?.content ?? "";

  await writeFile(
    filePath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        sessionId,
        cwd,
        model,
        generationOptions: generationOptions ?? null,
        thinkingMode: thinkingMode ?? null,
        diagnostics: {
          messageCount: messages.length,
          systemPromptLength: systemContent.length,
          hasToolProtocol: systemContent.includes("Tool calling protocol:"),
          hasToolCatalog: systemContent.includes("Available tools catalog:"),
          hasFilesystemListTool: systemContent.includes('"name": "filesystem.list"'),
          hasShellExecuteTool: systemContent.includes('"name": "shell.execute"'),
          hasOrqentToolCallTag: systemContent.includes("<orqent_tool_call>"),
        },
        request: {
          model,
          messages,
          generationOptions: generationOptions ?? null,
          thinkingMode: thinkingMode ?? null,
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  return filePath;
}