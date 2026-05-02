import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type {
  SkillActivationConfig,
  SkillDefinition,
  SkillDefinitionInput,
  SkillDefinitionsFile,
  SkillScope,
} from "./types.js";

const DEFAULT_SKILL_ACTIVATION: SkillActivationConfig = {
  manual: true,
  auto: false,
  keywords: [],
  filePatterns: [],
  toolNames: [],
};

function resolveDataDir() {
  const customDir = process.env.ORQENT_DATA_DIR?.trim();

  if (customDir) {
    return customDir;
  }

  return join(homedir(), ".orqent");
}

export function getSkillDefinitionsFilePath() {
  return join(resolveDataDir(), "skills", "definitions.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeIdentifier(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function assertValidSkillIdentifier(identifier: string): void {
  if (!identifier) {
    throw new Error("Skill identifier cannot be empty.");
  }

  if (!/^[a-z][a-z0-9._-]*$/i.test(identifier)) {
    throw new Error(
      `Invalid skill identifier "${identifier}". Use letters, numbers, ".", "_" or "-".`,
    );
  }
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeScope(value: unknown): SkillScope {
  if (value === "global" || value === "project") {
    return value;
  }

  return "project";
}

function normalizeIsoDate(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed.toISOString();
}

function normalizeActivation(value: unknown): SkillActivationConfig {
  if (!isRecord(value)) {
    return DEFAULT_SKILL_ACTIVATION;
  }

  return {
    manual: typeof value.manual === "boolean"
      ? value.manual
      : DEFAULT_SKILL_ACTIVATION.manual,
    auto: typeof value.auto === "boolean"
      ? value.auto
      : DEFAULT_SKILL_ACTIVATION.auto,
    keywords: normalizeStringArray(value.keywords),
    filePatterns: normalizeStringArray(value.filePatterns),
    toolNames: normalizeStringArray(value.toolNames),
  };
}

export function normalizeSkillDefinition(value: unknown): SkillDefinition | null {
  if (!isRecord(value)) {
    return null;
  }

  const identifier = normalizeIdentifier(value.identifier);

  if (!identifier) {
    return null;
  }

  const name = normalizeString(value.name);
  const description = normalizeString(value.description);
  const instructions = normalizeString(value.instructions);

  if (!name || !description || !instructions) {
    return null;
  }

  const now = new Date().toISOString();
  const createdAt = normalizeIsoDate(value.createdAt, now);
  const updatedAt = normalizeIsoDate(value.updatedAt, createdAt);

  return {
    identifier,
    name,
    description,
    instructions,
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    scope: normalizeScope(value.scope),
    activation: normalizeActivation(value.activation),
    createdAt,
    updatedAt,
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
  };
}

function validateSkillDefinition(skill: SkillDefinition): void {
  assertValidSkillIdentifier(skill.identifier);

  if (!skill.name.trim()) {
    throw new Error(`Skill "${skill.identifier}" requires name.`);
  }

  if (!skill.description.trim()) {
    throw new Error(`Skill "${skill.identifier}" requires description.`);
  }

  if (!skill.instructions.trim()) {
    throw new Error(`Skill "${skill.identifier}" requires instructions.`);
  }
}

function normalizeSkillDefinitionsFile(value: unknown): SkillDefinitionsFile {
  if (!isRecord(value) || !Array.isArray(value.skills)) {
    return {
      skills: [],
    };
  }

  return {
    skills: value.skills
      .map(normalizeSkillDefinition)
      .filter((skill): skill is SkillDefinition => skill !== null)
      .sort((left, right) => left.identifier.localeCompare(right.identifier)),
  };
}

export async function listSkillDefinitions(): Promise<SkillDefinition[]> {
  try {
    const raw = await readFile(getSkillDefinitionsFilePath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;

    return normalizeSkillDefinitionsFile(parsed).skills;
  } catch {
    return [];
  }
}

export async function saveSkillDefinitions(
  skills: SkillDefinition[],
): Promise<void> {
  const filePath = getSkillDefinitionsFilePath();

  await mkdir(dirname(filePath), {
    recursive: true,
  });

  const normalizedSkills = skills
    .map(normalizeSkillDefinition)
    .filter((skill): skill is SkillDefinition => skill !== null)
    .sort((left, right) => left.identifier.localeCompare(right.identifier));

  for (const skill of normalizedSkills) {
    validateSkillDefinition(skill);
  }

  await writeFile(
    filePath,
    JSON.stringify(
      {
        skills: normalizedSkills,
      },
      null,
      2,
    ),
    "utf8",
  );
}

export async function upsertSkillDefinition(
  input: SkillDefinitionInput,
): Promise<SkillDefinition> {
  const identifier = normalizeIdentifier(input.identifier);

  assertValidSkillIdentifier(identifier);

  const currentSkills = await listSkillDefinitions();
  const existingSkill = currentSkills.find(
    (skill) => skill.identifier === identifier,
  );
  const now = new Date().toISOString();

  const nextSkill = normalizeSkillDefinition({
    ...existingSkill,
    ...input,
    identifier,
    createdAt: existingSkill?.createdAt ?? input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    activation: {
      ...(existingSkill?.activation ?? DEFAULT_SKILL_ACTIVATION),
      ...(input.activation ?? {}),
    },
  });

  if (!nextSkill) {
    throw new Error("Cannot persist invalid skill definition.");
  }

  validateSkillDefinition(nextSkill);

  await saveSkillDefinitions([
    nextSkill,
    ...currentSkills.filter((skill) => skill.identifier !== identifier),
  ]);

  return nextSkill;
}

export async function readSkillDefinition(
  identifier: string,
): Promise<SkillDefinition | null> {
  const normalizedIdentifier = normalizeIdentifier(identifier);

  if (!normalizedIdentifier) {
    return null;
  }

  const skills = await listSkillDefinitions();

  return skills.find((skill) => skill.identifier === normalizedIdentifier) ?? null;
}

export async function deleteSkillDefinition(identifier: string): Promise<boolean> {
  const normalizedIdentifier = normalizeIdentifier(identifier);

  if (!normalizedIdentifier) {
    return false;
  }

  const skills = await listSkillDefinitions();
  const nextSkills = skills.filter(
    (skill) => skill.identifier !== normalizedIdentifier,
  );

  if (nextSkills.length === skills.length) {
    return false;
  }

  await saveSkillDefinitions(nextSkills);

  return true;
}
