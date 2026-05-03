import { listSkillDefinitions } from "./storage.js";
import { listSkillMarkdownDefinitions } from "./markdown-loader.js";
import type { SkillDefinition } from "./types.js";

export async function listAvailableSkillDefinitions({
  cwd = process.cwd(),
}: {
  cwd?: string;
} = {}): Promise<SkillDefinition[]> {
  const [storedSkills, markdownSkills] = await Promise.all([
    listSkillDefinitions(),
    listSkillMarkdownDefinitions({
      cwd,
    }),
  ]);

  const byIdentifier = new Map<string, SkillDefinition>();

  for (const skill of storedSkills) {
    byIdentifier.set(skill.identifier, skill);
  }

  for (const skill of markdownSkills) {
    byIdentifier.set(skill.identifier, skill);
  }

  return [ ...byIdentifier.values() ].sort((left, right) =>
    left.identifier.localeCompare(right.identifier),
  );
}
