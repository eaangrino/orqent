import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_APP_SHELL_CONFIG,
  getAppShellConfigFilePath,
  loadAppShellConfig,
  saveAppShellConfig,
} from "../storage.js";

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, {
      recursive: true,
      force: true,
    });
    tempDir = "";
  }

  delete process.env.ORQENT_DATA_DIR;
});

describe("app shell storage", () => {
  it("loadAppShellConfig devuelve defaults cuando no existe archivo", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-app-shell-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await expect(loadAppShellConfig()).resolves.toEqual(
      DEFAULT_APP_SHELL_CONFIG,
    );
  });

  it("saveAppShellConfig persiste la última vista activa", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-app-shell-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await saveAppShellConfig({
      lastActiveView: "model",
    });

    const raw = await readFile(getAppShellConfigFilePath(), "utf8");
    const parsed = JSON.parse(raw);

    expect(parsed).toEqual({
      lastActiveView: "model",
    });
  });

  it("loadAppShellConfig normaliza vistas inválidas", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-app-shell-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await writeFile(
      getAppShellConfigFilePath(),
      JSON.stringify({
        lastActiveView: "invalid-view",
      }),
      "utf8",
    );

    await expect(loadAppShellConfig()).resolves.toEqual({
      lastActiveView: "home",
    });
  });
});