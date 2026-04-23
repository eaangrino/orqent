import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultState } from '../core/tasks.js';

const execFileAsync = promisify(execFile);

let tempDir = '';

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = '';
  }
});

describe('CLI', () => {
  it('orqent --reset reescribe el estado por defecto en el directorio indicado', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'orqent-cli-test-'));

    const env = {
      ...process.env,
      ORQENT_DATA_DIR: tempDir,
    };

    const { stdout, stderr } = await execFileAsync('node', [ 'dist/index.js', '--reset' ], {
      env,
    });

    const stateFile = join(tempDir, 'state.json');
    const raw = await readFile(stateFile, 'utf8');
    const parsed = JSON.parse(raw);

    expect(stderr).toBe('');
    expect(stdout).toContain(`Estado reiniciado: ${stateFile}`);
    expect(parsed).toEqual(createDefaultState());
  });

  it('orqent --help muestra la ayuda', async () => {
    const { stdout, stderr } = await execFileAsync('node', [ 'dist/index.js', '--help' ]);

    expect(stderr).toBe('');
    expect(stdout).toContain('Usage');
    expect(stdout).toContain('$ orqent');
    expect(stdout).toContain('--reset');
  });

  it('orqent --version muestra la versión actual', async () => {
    const packageJsonRaw = await readFile(join(process.cwd(), 'package.json'), 'utf8');
    const packageJson = JSON.parse(packageJsonRaw) as { version: string };

    const { stdout, stderr } = await execFileAsync('node', [ 'dist/index.js', '--version' ]);

    expect(stderr).toBe('');
    expect(stdout.trim()).toBe(packageJson.version);
  });
});