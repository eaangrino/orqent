import type { AgentDefinition } from "./types.js";

type AgentCatalogItem = {
  identifier: string;
  name: string;
  whenToUse: string;
  allowedTools: string[];
  model: string | null;
  scope: string;
  memoryScope: string;
  permissionMode: string;
};

function toCatalogItem(agent: AgentDefinition): AgentCatalogItem {
  return {
    identifier: agent.identifier,
    name: agent.name,
    whenToUse: agent.whenToUse,
    allowedTools: agent.allowedTools,
    model: agent.model,
    scope: agent.scope,
    memoryScope: agent.memoryScope,
    permissionMode: agent.permissionMode,
  };
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return JSON.stringify({
      error: "Value could not be serialized.",
    });
  }
}

export function buildAgentCatalogPrompt(agents: AgentDefinition[]): string {
  const catalog = agents.map(toCatalogItem);

  return [
    "Persistent agent catalog:",
    "",
    catalog.length > 0
      ? safeJsonStringify(catalog)
      : "No persistent agents are currently registered.",
    "",
    "Agent catalog rules:",
    "- These entries are persistent agent definitions known by the runtime.",
    "- If the user asks to create or update an agent definition, use agent.create_definition when appropriate.",
    "- If the user asks which agents exist, use agent.list_definitions when runtime freshness matters.",
    "- If the user asks to inspect prepared/running/completed subagent tasks, use agent.list_tasks when appropriate.",
    "- If the user asks to delegate work to an existing agent for later, use agent.spawn without executeNow or with executeNow=false.",
    "- If the user asks to delegate work to an existing agent and expects a result now, use agent.spawn with executeNow=true.",
    "- agent.spawn without executeNow creates a persistent agent instance and independent task state, but does not execute the subagent.",
    "- agent.spawn with executeNow=true runs the subagent synchronously and returns execution.status as completed or failed.",
    "- Current synchronous subagent execution performs a direct model call with isolated context. It does not run internal subagent tool calling yet.",
    "- When agent.spawn returns execution.status = \"stubbed\", report only that the agent instance/task was created. Do not invent a child-agent result.",
    "- When agent.spawn returns execution.status = \"completed\", you may summarize the returned subagent response as the child-agent result.",
    "- When agent.spawn returns execution.status = \"failed\", report the failure and the returned error.",
    "- Do not claim that an agent inspected files, used tools, executed commands, or modified external state unless a runtime tool result explicitly says so.",
    "- Treat allowedTools as the intended tool boundary for that agent, not as permission to use those tools directly from the parent conversation.",
  ].join("\n");
}