import { realpathSync } from "node:fs";

export function resolveRuntimeCwd(cwd = process.cwd()): string {
  try {
    return realpathSync(cwd).normalize("NFC");
  } catch {
    return cwd.normalize("NFC");
  }
}

export function buildRuntimeContextPrompt({
  cwd = process.cwd(),
}: {
  cwd?: string;
} = {}): string {
  const runtimeCwd = resolveRuntimeCwd(cwd);

  return [
    "Runtime context:",
    `- Current working directory: ${runtimeCwd}`,
    `- Current project/workspace/repository root for this turn: ${runtimeCwd}`,
    "",
    "Runtime context rules:",
    "- Treat references such as current project, this project, this repo, this repository, workspace, codebase, aquí, acá, este proyecto, el proyecto, el repo, and la ruta actual as references to the current working directory above.",
    "- If the user asks for the current project path, current directory, working directory, or repository path, answer directly using the current working directory above.",
    "- Do not ask the user to run pwd when the current working directory is already provided in runtime context.",
    "- If the user asks to inspect, review, audit, diagnose, summarize, analyze, or understand the current project/codebase/repository, you must use available read/search/list tools before giving a diagnosis.",
    "- For project diagnostics, first inspect project metadata and structure such as package.json, tsconfig files, source folders, tests, configuration files, and relevant entrypoints before making claims.",
    "- Do not claim to know project practices, architecture, dependencies, tests, scripts, or file contents unless they were provided in the prompt or obtained through tool results.",
    "- Use tools only when the answer requires inspecting files, reading content, searching project text, or executing an action.",
  ].join("\n");
}
