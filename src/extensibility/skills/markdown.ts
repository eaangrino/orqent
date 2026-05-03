import type {
  SkillActivationConfig,
  SkillDefinitionInput,
  SkillScope,
} from "./types.js";

type FrontmatterValue = string | boolean | string[];

const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  return fallback;
}

function normalizeScope(value: unknown): SkillScope | undefined {
  if (value === "global" || value === "project") {
    return value;
  }

  return undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [ value.trim() ];
  }

  return [];
}

function parseScalar(value: string): string | boolean {
  const trimmed = value.trim();

  if (trimmed === "true") {
    return true;
  }

  if (trimmed === "false") {
    return false;
  }

  return trimmed.replace(/^["']|["']$/g, "");
}

function parseFrontmatter(rawFrontmatter: string): Record<string, FrontmatterValue> {
  const result: Record<string, FrontmatterValue> = {};
  const lines = rawFrontmatter.split("\n");
  let currentArrayKey: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim() || line.trimStart().startsWith("#")) {
      continue;
    }

    const arrayItemMatch = line.match(/^\s*-\s+(.+)$/);

    if (arrayItemMatch && currentArrayKey) {
      const currentValue = result[currentArrayKey];

      if (Array.isArray(currentValue)) {
        currentValue.push(String(parseScalar(arrayItemMatch[1] ?? "")));
      }

      continue;
    }

    const keyValueMatch = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*):(?:\s*(.*))?$/);

    if (!keyValueMatch) {
      currentArrayKey = null;
      continue;
    }

    const key = keyValueMatch[1] ?? "";
    const rawValue = keyValueMatch[2] ?? "";

    if (!rawValue.trim()) {
      result[key] = [];
      currentArrayKey = key;
      continue;
    }

    result[key] = parseScalar(rawValue);
    currentArrayKey = null;
  }

  return result;
}

export function parseSkillMarkdown(content: string): SkillDefinitionInput | null {
  const match = content.match(FRONTMATTER_PATTERN);

  if (!match) {
    return null;
  }

  const frontmatter = parseFrontmatter(match[1] ?? "");
  const instructions = normalizeString(match[2] ?? "");

  const identifier = normalizeString(frontmatter.identifier);
  const name = normalizeString(frontmatter.name);
  const description = normalizeString(frontmatter.description);

  if (!identifier || !name || !description || !instructions) {
    return null;
  }

  const activation: Partial<SkillActivationConfig> = {
    manual: normalizeBoolean(frontmatter.manual, true),
    auto: normalizeBoolean(frontmatter.auto, false),
    keywords: normalizeStringArray(frontmatter.keywords),
    filePatterns: normalizeStringArray(frontmatter.filePatterns),
    toolNames: normalizeStringArray(frontmatter.toolNames),
  };

  return {
    identifier,
    name,
    description,
    instructions,
    enabled: normalizeBoolean(frontmatter.enabled, true),
    scope: normalizeScope(frontmatter.scope),
    activation,
  };
}
