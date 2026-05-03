import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_OLLAMA_CONFIG } from "../models/ollama/config.js";

const execFileAsync = promisify(execFile);

let tempDir = "";

function runSourceCli(args: string[], env?: NodeJS.ProcessEnv) {
  const tsxBin = join(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsx.cmd" : "tsx",
  );

  return execFileAsync(tsxBin, [ "src/index.tsx", ...args ], {
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

    const { stdout, stderr } = await runSourceCli([ "--reset" ], env);

    const configFile = join(tempDir, "ollama-config.json");
    const raw = await readFile(configFile, "utf8");
    const parsed = JSON.parse(raw);

    expect(stderr).toBe("");
    expect(stdout).toContain(`Configuration reset: ${configFile}`);
    expect(parsed).toEqual(DEFAULT_OLLAMA_CONFIG);
  });

  it("orqent --help muestra la ayuda", async () => {
    const { stdout, stderr } = await runSourceCli([ "--help" ]);

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

    const { stdout, stderr } = await runSourceCli([ "--version" ]);

    expect(stderr).toBe("");
    expect(stdout.trim()).toBe(packageJson.version);
  });

  it("orqent mcp add registra un servidor MCP desde consola", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-cli-test-"));

    const env = {
      ...process.env,
      ORQENT_DATA_DIR: tempDir,
    };

    const { stdout, stderr } = await runSourceCli(
      [
        "mcp",
        "add",
        "filesystem",
        "--transport",
        "stdio",
        "--command",
        "node",
        "--arg",
        "server.js",
      ],
      env,
    );

    const raw = await readFile(join(tempDir, "mcp", "servers.json"), "utf8");
    const parsed = JSON.parse(raw);

    expect(stderr).toBe("");
    expect(stdout).toContain("MCP server persisted: filesystem");
    expect(parsed.servers[ 0 ]).toMatchObject({
      name: "filesystem",
      enabled: true,
      transport: "stdio",
      command: "node",
      args: [ "server.js" ],
    });
  });

  it("orqent mcp list lista servidores sin exponer secretos", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-cli-test-"));

    const env = {
      ...process.env,
      ORQENT_DATA_DIR: tempDir,
    };

    await runSourceCli(
      [
        "mcp",
        "add",
        "postgres_local",
        "--transport",
        "streamable_http",
        "--url",
        "http://127.0.0.1:6060/mcp",
        "--header",
        "x-database-uri=postgresql://postgres:admin@host.local:5433/Local",
      ],
      env,
    );

    const { stdout, stderr } = await runSourceCli([ "mcp", "list" ], env);

    expect(stderr).toBe("");
    expect(stdout).toContain("postgres_local");
    expect(stdout).toContain("streamable_http");
    expect(stdout).toContain("private=headers");
    expect(stdout).not.toContain("postgresql://postgres");
  });

  it("orqent mcp remove elimina servidores desde consola", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orqent-cli-test-"));

    const env = {
      ...process.env,
      ORQENT_DATA_DIR: tempDir,
    };

    await runSourceCli(
      [
        "mcp",
        "add",
        "temporary",
        "--transport",
        "stdio",
        "--command",
        "node",
      ],
      env,
    );

    const { stdout, stderr } = await runSourceCli(
      [ "mcp", "remove", "temporary" ],
      env,
    );

    const raw = await readFile(join(tempDir, "mcp", "servers.json"), "utf8");
    const parsed = JSON.parse(raw);

    expect(stderr).toBe("");
    expect(stdout).toContain("MCP server deleted: temporary");
    expect(parsed.servers).toEqual([]);
  });
});
