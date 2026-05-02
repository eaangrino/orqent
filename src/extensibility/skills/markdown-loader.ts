import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { parseSkillMarkdown } from "./markdown.js";
import { normalizeSkillDefinition } from "./storage.js";
import type { SkillDefinition } from "./types.js";

export type SkillMarkdownSource = "global" | "workspace";

export type LoadedSkillMarkdownFile = {
  filePath: string;
  fileName: string;
  source: SkillMarkdownSource;
  skill: SkillDefinition;
};

function resolveDataDir() {
  const customDir = process.env.ORQENT_DATA_DIR?.trim();

  if (customDir) {
    return customDir;
  }

  return join(homedir(), ".orqent");
}

export function getGlobalSkillMarkdownDir() {
  return join(resolveDataDir(), "skills");
}

export function getWorkspaceSkillMarkdownDir(cwd = process.cwd()) {
  return join(cwd, ".orqent", "skills");
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, {
      withFileTypes: true,
    });

    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => name.toLowerCase().endsWith(".md"))
      .sort((left, right) => left.localeCompare(right))
      .map((name) => join(dir, name));
  } catch {
    return [];
  }
}

async function loadSkillMarkdownDir({
  dir,
  source,
}: {
  dir: string;
  source: SkillMarkdownSource;
}): Promise<LoadedSkillMarkdownFile[]> {
  const files = await listMarkdownFiles(dir);
  const loaded: LoadedSkillMarkdownFile[] = [];

  for (const filePath of files) {
    try {
      const raw = await readFile(filePath, "utf8");
      const input = parseSkillMarkdown(raw);
      const skill = normalizeSkillDefinition(input);

      if (!skill) {
        continue;
      }

      loaded.push({
        filePath,
        fileName: basename(filePath),
        source,
        skill,
      });
    } catch {
      // Invalid or unreadable markdown skills are ignored for now.
    }
  }

  return loaded;
}

export async function loadSkillMarkdownFiles({
  cwd = process.cwd(),
}: {
  cwd?: string;
} = {}): Promise<LoadedSkillMarkdownFile[]> {
  const globalSkills = await loadSkillMarkdownDir({
    dir: getGlobalSkillMarkdownDir(),
    source: "global",
  });

  const workspaceSkills = await loadSkillMarkdownDir({
    dir: getWorkspaceSkillMarkdownDir(cwd),
    source: "workspace",
  });

  const byIdentifier = new Map<string, LoadedSkillMarkdownFile>();

  for (const loadedSkill of globalSkills) {
    byIdentifier.set(loadedSkill.skill.identifier, loadedSkill);
  }

  for (const loadedSkill of workspaceSkills) {
    byIdentifier.set(loadedSkill.skill.identifier, loadedSkill);
  }

  return [ ...byIdentifier.values() ].sort((left, right) =>
    left.skill.identifier.localeCompare(right.skill.identifier),
  );
}

export async function listSkillMarkdownDefinitions({
  cwd = process.cwd(),
}: {
  cwd?: string;
} = {}): Promise<SkillDefinition[]> {
  const loadedSkills = await loadSkillMarkdownFiles({
    cwd,
  });

  return loadedSkills.map((loadedSkill) => loadedSkill.skill);
}
