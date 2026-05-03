import type { AgentDefinition } from "./types.js";
import { listAgentDefinitions } from "./storage.js";

function normalizeAgentIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}

function assertValidAgentIdentifier(identifier: string): void {
  if (!identifier.trim()) {
    throw new Error("Agent identifier cannot be empty.");
  }

  if (!/^[a-z][a-z0-9._-]*$/i.test(identifier)) {
    throw new Error(
      `Invalid agent identifier "${identifier}". Use letters, numbers, ".", "_" or "-".`,
    );
  }
}

function normalizeAllowedTools(allowedTools: string[]): string[] {
  return Array.from(
    new Set(
      allowedTools
        .map((toolName) => toolName.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

export class AgentRegistry {
  private readonly agents = new Map<string, AgentDefinition>();

  constructor(agents: AgentDefinition[] = []) {
    for (const agent of agents) {
      this.register(agent);
    }
  }

  register(agent: AgentDefinition): void {
    assertValidAgentIdentifier(agent.identifier);

    const normalizedIdentifier = normalizeAgentIdentifier(agent.identifier);

    if (this.agents.has(normalizedIdentifier)) {
      throw new Error(`Agent "${agent.identifier}" is already registered.`);
    }

    this.agents.set(normalizedIdentifier, {
      ...agent,
      identifier: normalizedIdentifier,
      allowedTools: normalizeAllowedTools(agent.allowedTools),
    });
  }

  list(): AgentDefinition[] {
    return Array.from(this.agents.values()).sort((left, right) =>
      left.identifier.localeCompare(right.identifier),
    );
  }

  get(identifier: string): AgentDefinition | undefined {
    return this.agents.get(normalizeAgentIdentifier(identifier));
  }

  has(identifier: string): boolean {
    return this.agents.has(normalizeAgentIdentifier(identifier));
  }

  delete(identifier: string): boolean {
    return this.agents.delete(normalizeAgentIdentifier(identifier));
  }
}

export function createAgentRegistry(
  agents: AgentDefinition[] = [],
): AgentRegistry {
  return new AgentRegistry(agents);
}

export async function loadAgentRegistry(): Promise<AgentRegistry> {
  const agents = await listAgentDefinitions();

  return createAgentRegistry(agents);
}