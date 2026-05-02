import type { SkillDefinition } from "./types.js";

export type SkillActivationSource = "manual" | "auto";

export type ActiveSkillSelection = {
  skill: SkillDefinition;
  source: SkillActivationSource;
  reason: string;
};

export type ResolveActiveSkillsForPromptInput = {
  prompt: string;
  skills: SkillDefinition[];
};

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function matchesKeyword(prompt: string, keyword: string): boolean {
  const normalizedPrompt = normalizeSearchText(prompt);
  const normalizedKeyword = normalizeSearchText(keyword);

  if (!normalizedKeyword) {
    return false;
  }

  return normalizedPrompt.includes(normalizedKeyword);
}

const MANUAL_SKILL_PATTERNS = [
  /(?:^|\s)@skill:([a-z][a-z0-9._-]*)/gi,
];

function normalizeSkillIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

export function extractManualSkillIdentifiers(prompt: string): string[] {
  const identifiers = new Set<string>();

  for (const pattern of MANUAL_SKILL_PATTERNS) {
    for (const match of prompt.matchAll(pattern)) {
      const identifier = match[ 1 ];

      if (identifier) {
        identifiers.add(normalizeSkillIdentifier(identifier));
      }
    }
  }

  return [ ...identifiers ];
}

export function resolveManuallyActivatedSkills({
  prompt,
  skills,
}: ResolveActiveSkillsForPromptInput): ActiveSkillSelection[] {
  const requestedIdentifiers = new Set(extractManualSkillIdentifiers(prompt));

  if (requestedIdentifiers.size === 0) {
    return [];
  }

  return skills
    .filter((skill) => skill.enabled)
    .filter((skill) => skill.activation.manual)
    .filter((skill) => requestedIdentifiers.has(skill.identifier))
    .map((skill) => ({
      skill,
      source: "manual" as const,
      reason: `Matched explicit manual skill request for "${skill.identifier}".`,
    }));
}

export function resolveAutomaticallyActivatedSkills({
  prompt,
  skills,
}: ResolveActiveSkillsForPromptInput): ActiveSkillSelection[] {
  return skills
    .filter((skill) => skill.enabled)
    .filter((skill) => skill.activation.auto)
    .filter((skill) =>
      skill.activation.keywords.some((keyword) => matchesKeyword(prompt, keyword)),
    )
    .map((skill) => ({
      skill,
      source: "auto" as const,
      reason: `Matched automatic skill keyword rule for "${skill.identifier}".`,
    }));
}

export function resolveActiveSkillsForPrompt(
  input: ResolveActiveSkillsForPromptInput,
): ActiveSkillSelection[] {
  const selections = new Map<string, ActiveSkillSelection>();

  for (const selection of resolveAutomaticallyActivatedSkills(input)) {
    selections.set(selection.skill.identifier, selection);
  }

  for (const selection of resolveManuallyActivatedSkills(input)) {
    selections.set(selection.skill.identifier, selection);
  }

  return [ ...selections.values() ].sort((left, right) =>
    left.skill.identifier.localeCompare(right.skill.identifier),
  );
}
