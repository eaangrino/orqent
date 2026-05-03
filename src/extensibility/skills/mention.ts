import type { SkillDefinition } from "./types.js";

export type SkillMentionSuggestion = {
  identifier: string;
  name: string;
  description: string;
};

export type SkillMentionQuery = {
  query: string;
};

export type GetSkillMentionSuggestionsInput = {
  prompt: string;
  skills: SkillDefinition[];
  maxSuggestions?: number;
};

const ACTIVE_SKILL_MENTION_PATTERN = /(?:^|\s)@skill:([a-z0-9._-]*)$/i;

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

export function extractActiveSkillMentionQuery(
  prompt: string,
): SkillMentionQuery | null {
  const match = prompt.match(ACTIVE_SKILL_MENTION_PATTERN);

  if (!match) {
    return null;
  }

  return {
    query: normalizeSearchText(match[ 1 ] ?? ""),
  };
}

export function getSkillMentionSuggestions({
  prompt,
  skills,
  maxSuggestions = 8,
}: GetSkillMentionSuggestionsInput): SkillMentionSuggestion[] {
  const mentionQuery = extractActiveSkillMentionQuery(prompt);

  if (!mentionQuery) {
    return [];
  }

  const query = mentionQuery.query;

  return skills
    .filter((skill) => skill.enabled)
    .filter((skill) => skill.activation.manual)
    .filter((skill) => {
      if (!query) {
        return true;
      }

      return (
        skill.identifier.includes(query) ||
        normalizeSearchText(skill.name).includes(query)
      );
    })
    .sort((left, right) => left.identifier.localeCompare(right.identifier))
    .slice(0, Math.max(1, maxSuggestions))
    .map((skill) => ({
      identifier: skill.identifier,
      name: skill.name,
      description: skill.description,
    }));
}

export function replaceActiveSkillMention(
  prompt: string,
  identifier: string,
): string {
  const normalizedIdentifier = normalizeSearchText(identifier);

  if (!normalizedIdentifier) {
    return prompt;
  }

  if (!ACTIVE_SKILL_MENTION_PATTERN.test(prompt)) {
    return prompt;
  }

  return prompt.replace(
    ACTIVE_SKILL_MENTION_PATTERN,
    (match) => {
      const leadingWhitespace = match.startsWith(" ") ? " " : "";

      return `${leadingWhitespace}@skill:${normalizedIdentifier} `;
    },
  );
}
