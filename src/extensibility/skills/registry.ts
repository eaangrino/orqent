import type { SkillDefinition } from "./types.js";
import { listSkillDefinitions } from "./storage.js";

function normalizeSkillIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}

function assertValidSkillIdentifier(identifier: string): void {
  if (!identifier.trim()) {
    throw new Error("Skill identifier cannot be empty.");
  }

  if (!/^[a-z][a-z0-9._-]*$/i.test(identifier)) {
    throw new Error(
      `Invalid skill identifier "${identifier}". Use letters, numbers, ".", "_" or "-".`,
    );
  }
}

function cloneSkill(skill: SkillDefinition): SkillDefinition {
  return {
    ...skill,
    activation: {
      manual: skill.activation.manual,
      auto: skill.activation.auto,
      keywords: [ ...skill.activation.keywords ],
      filePatterns: [ ...skill.activation.filePatterns ],
      toolNames: [ ...skill.activation.toolNames ],
    },
    metadata: skill.metadata ? { ...skill.metadata } : undefined,
  };
}

export class SkillRegistry {
  private readonly skills = new Map<string, SkillDefinition>();

  constructor(skills: SkillDefinition[] = []) {
    for (const skill of skills) {
      this.register(skill);
    }
  }

  register(skill: SkillDefinition): void {
    assertValidSkillIdentifier(skill.identifier);

    const normalizedIdentifier = normalizeSkillIdentifier(skill.identifier);

    if (this.skills.has(normalizedIdentifier)) {
      throw new Error(`Skill "${skill.identifier}" is already registered.`);
    }

    this.skills.set(normalizedIdentifier, cloneSkill({
      ...skill,
      identifier: normalizedIdentifier,
    }));
  }

  list(): SkillDefinition[] {
    return Array.from(this.skills.values())
      .map(cloneSkill)
      .sort((left, right) => left.identifier.localeCompare(right.identifier));
  }

  listEnabled(): SkillDefinition[] {
    return this.list().filter((skill) => skill.enabled);
  }

  listManual(): SkillDefinition[] {
    return this.listEnabled().filter((skill) => skill.activation.manual);
  }

  listAuto(): SkillDefinition[] {
    return this.listEnabled().filter((skill) => skill.activation.auto);
  }

  get(identifier: string): SkillDefinition | undefined {
    const skill = this.skills.get(normalizeSkillIdentifier(identifier));

    return skill ? cloneSkill(skill) : undefined;
  }

  has(identifier: string): boolean {
    return this.skills.has(normalizeSkillIdentifier(identifier));
  }

  delete(identifier: string): boolean {
    return this.skills.delete(normalizeSkillIdentifier(identifier));
  }
}

export function createSkillRegistry(
  skills: SkillDefinition[] = [],
): SkillRegistry {
  return new SkillRegistry(skills);
}

export async function loadSkillRegistry(): Promise<SkillRegistry> {
  const skills = await listSkillDefinitions();

  return createSkillRegistry(skills);
}
