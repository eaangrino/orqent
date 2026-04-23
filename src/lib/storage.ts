import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { createDefaultState, type AppState, type Task } from '../core/tasks.js';

export type PersistedTask = Task;
export type PersistedState = AppState;

function resolveDataDir() {
  const customDir = process.env.ORQENT_DATA_DIR?.trim();

  if (customDir) {
    return customDir;
  }

  return join(homedir(), '.orqent');
}

function resolveDataFile() {
  return join(resolveDataDir(), 'state.json');
}

export async function loadState(): Promise<PersistedState> {
  try {
    const raw = await readFile(resolveDataFile(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    const fallback = createDefaultState();

    return {
      visitCount:
        typeof parsed.visitCount === 'number' ? parsed.visitCount : fallback.visitCount,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : fallback.tasks,
    };
  } catch {
    return createDefaultState();
  }
}

export async function saveState(state: PersistedState): Promise<void> {
  const dataFile = resolveDataFile();

  await mkdir(dirname(dataFile), { recursive: true });
  await writeFile(dataFile, JSON.stringify(state, null, 2), 'utf8');
}

export async function resetState(): Promise<void> {
  await saveState(createDefaultState());
}

export function getStateFilePath() {
  return resolveDataFile();
}