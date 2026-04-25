import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_OLLAMA_CONFIG } from "../features/ollama/config.js";

const execFileAsync = promisify(execFile);

let tempDir = "";

function runSourceCli(args: string[], env?: NodeJS.ProcessEnv) {
  return execFileAsync("npx", ["tsx", "src/index.tsx", ...args], {
    env,
  });
}

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

describe("CLI", () => {
  it("orqent --reset reescribe la configuración por defecto en el directorio indicado", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-cli-test-"));

    const env = {
      ...process.env,
      ORQENT_DATA_DIR: tempDir,
    };

    const { stdout, stderr } = await runSourceCli(["--reset"], env);

    const configFile = join(tempDir, "ollama-config.json");
    const raw = await readFile(configFile, "utf8");
    const parsed = JSON.parse(raw);

    expect(stderr).toBe("");
    expect(stdout).toContain(`Configuración reiniciada: ${configFile}`);
    expect(parsed).toEqual(DEFAULT_OLLAMA_CONFIG);
  });

  it("orqent --help muestra la ayuda", async () => {
    const { stdout, stderr } = await runSourceCli(["--help"]);

    expect(stderr).toBe("");
    expect(stdout).toContain("Usage");
    expect(stdout).toContain("$ orqent");
    expect(stdout).toContain("--reset");
  });

  it("orqent --version muestra la versión actual", async () => {
    const packageJsonRaw = await readFile(
      join(process.cwd(), "package.json"),
      "utf8",
    );
    const packageJson = JSON.parse(packageJsonRaw) as { version: string };

    const { stdout, stderr } = await runSourceCli(["--version"]);

    expect(stderr).toBe("");
    expect(stdout.trim()).toBe(packageJson.version);
  });
});
