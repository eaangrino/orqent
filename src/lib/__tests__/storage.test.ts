import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDefaultState } from '../../core/tasks.js';
import { getStateFilePath, loadState, resetState, saveState } from '../storage.js';

let tempDir = '';

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'orqent-test-'));
  process.env.ORQENT_DATA_DIR = tempDir;
});

afterEach(async () => {
  delete process.env.ORQENT_DATA_DIR;

  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = '';
  }
});

describe('storage', () => {
  it('devuelve el estado por defecto si no existe el archivo', async () => {
    const result = await loadState();

    expect(result).toEqual(createDefaultState());
  });

  it('guarda y vuelve a cargar el estado persistido', async () => {
    const state = {
      visitCount: 7,
      tasks: [
        { id: 1, title: 'Uno', done: true },
        { id: 2, title: 'Dos', done: false },
      ],
    };

    await saveState(state);

    const loaded = await loadState();

    expect(getStateFilePath()).toBe(join(tempDir, 'state.json'));
    expect(loaded).toEqual(state);
  });

  it('resetState reescribe el archivo con el estado por defecto', async () => {
    await saveState({
      visitCount: 99,
      tasks: [ { id: 1, title: 'Temporal', done: false } ],
    });

    await resetState();

    const loaded = await loadState();

    expect(loaded).toEqual(createDefaultState());
  });

  it('si el JSON está corrupto, vuelve al estado por defecto', async () => {
    await writeFile(join(tempDir, 'state.json'), '{ roto', 'utf8');

    const loaded = await loadState();

    expect(loaded).toEqual(createDefaultState());
  });

  it('ignora ORQENT_DATA_DIR si está vacío o solo tiene espacios', () => {
    process.env.ORQENT_DATA_DIR = '   ';

    expect(getStateFilePath()).toBe(join(homedir(), '.orqent', 'state.json'));
  });

  it('usa valores por defecto cuando el JSON parsea pero trae campos inválidos', async () => {
    await writeFile(
      join(tempDir, 'state.json'),
      JSON.stringify({
        visitCount: 'no-es-numero',
        tasks: 'no-es-array',
      }),
      'utf8',
    );

    const loaded = await loadState();
    const fallback = createDefaultState();

    expect(loaded).toEqual({
      visitCount: fallback.visitCount,
      tasks: fallback.tasks,
    });
  });
});