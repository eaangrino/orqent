import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readMcpServer,
  upsertMcpServer,
} from "../extensibility/mcp/index.js";
import { describe, expect, it, vi } from "vitest";
import { runCli } from "../cli.js";

describe("runCli", () => {
  it("lista servidores MCP desde CLI sin arrancar la TUI", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "orqent-cli-unit-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await upsertMcpServer({
      name: "postgres_local",
      enabled: true,
      transport: "streamable_http",
      url: "http://127.0.0.1:6060/mcp",
      headers: {
        "x-database-uri": "should-not-leak",
      },
    });

    const logImpl = vi.fn();
    const runAppImpl = vi.fn();

    await runCli({
      argv: [ "mcp", "list" ],
      logImpl,
      runAppImpl,
      packageVersion: "1.0.0",
    });

    expect(runAppImpl).not.toHaveBeenCalled();
    expect(logImpl).toHaveBeenCalledTimes(1);
    expect(logImpl.mock.calls[ 0 ]?.[ 0 ]).toContain("postgres_local");
    expect(logImpl.mock.calls[ 0 ]?.[ 0 ]).toContain("streamable_http");
    expect(logImpl.mock.calls[ 0 ]?.[ 0 ]).toContain("private=headers");
    expect(logImpl.mock.calls[ 0 ]?.[ 0 ]).not.toContain("should-not-leak");
  });

  it("registra servidor MCP stdio desde CLI", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "orqent-cli-unit-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const logImpl = vi.fn();
    const runAppImpl = vi.fn();

    await runCli({
      argv: [
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
      logImpl,
      runAppImpl,
      packageVersion: "1.0.0",
    });

    expect(runAppImpl).not.toHaveBeenCalled();
    expect(logImpl.mock.calls[ 0 ]?.[ 0 ]).toContain(
      "MCP server persisted: filesystem",
    );

    await expect(readMcpServer("filesystem")).resolves.toMatchObject({
      name: "filesystem",
      enabled: true,
      transport: "stdio",
      command: "node",
      args: [ "server.js" ],
    });
  });

  it("registra servidor MCP streamable_http desde CLI con headers", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "orqent-cli-unit-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    const logImpl = vi.fn();
    const runAppImpl = vi.fn();

    await runCli({
      argv: [
        "mcp",
        "add",
        "postgres_local",
        "--transport",
        "streamable_http",
        "--url",
        "http://127.0.0.1:6060/mcp",
        "--timeout-ms",
        "20000",
        "--header",
        "Accept=application/json, text/event-stream",
        "--header",
        "x-database-uri=postgresql://postgres:admin@host.local:5433/Local",
      ],
      logImpl,
      runAppImpl,
      packageVersion: "1.0.0",
    });

    const server = await readMcpServer("postgres_local");

    expect(runAppImpl).not.toHaveBeenCalled();
    expect(server).toMatchObject({
      name: "postgres_local",
      enabled: true,
      transport: "streamable_http",
      url: "http://127.0.0.1:6060/mcp",
      timeoutMs: 20000,
      headers: {
        Accept: "application/json, text/event-stream",
        "x-database-uri": "postgresql://postgres:admin@host.local:5433/Local",
      },
    });

    expect(logImpl.mock.calls[ 0 ]?.[ 0 ]).not.toContain(
      "postgresql://postgres",
    );
  });

  it("elimina servidor MCP desde CLI", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "orqent-cli-unit-test-"));
    process.env.ORQENT_DATA_DIR = tempDir;

    await upsertMcpServer({
      name: "temporary",
      transport: "stdio",
      command: "node",
    });

    const logImpl = vi.fn();
    const runAppImpl = vi.fn();

    await runCli({
      argv: [ "mcp", "remove", "temporary" ],
      logImpl,
      runAppImpl,
      packageVersion: "1.0.0",
    });

    expect(runAppImpl).not.toHaveBeenCalled();
    expect(logImpl.mock.calls[ 0 ]?.[ 0 ]).toBe(
      "MCP server deleted: temporary",
    );
    await expect(readMcpServer("temporary")).resolves.toBeNull();
  });

  it("muestra la ayuda cuando recibe --help", async () => {
    const logImpl = vi.fn();
    const runAppImpl = vi.fn();
    const resetStateImpl = vi.fn();

    await runCli({
      argv: [ "--help" ],
      logImpl,
      runAppImpl,
      resetStateImpl,
      packageVersion: "1.0.0",
    });

    expect(logImpl).toHaveBeenCalledTimes(1);
    expect(logImpl.mock.calls[ 0 ]?.[ 0 ]).toContain("Usage");
    expect(runAppImpl).not.toHaveBeenCalled();
    expect(resetStateImpl).not.toHaveBeenCalled();
  });

  it("muestra la versión cuando recibe --version", async () => {
    const logImpl = vi.fn();
    const runAppImpl = vi.fn();
    const resetStateImpl = vi.fn();

    await runCli({
      argv: [ "--version" ],
      logImpl,
      runAppImpl,
      resetStateImpl,
      packageVersion: "1.2.3",
    });

    expect(logImpl).toHaveBeenCalledWith("1.2.3");
    expect(runAppImpl).not.toHaveBeenCalled();
    expect(resetStateImpl).not.toHaveBeenCalled();
  });

  it("resetea la configuración cuando recibe --reset", async () => {
    const logImpl = vi.fn();
    const runAppImpl = vi.fn();
    const resetStateImpl = vi.fn().mockResolvedValue(undefined);

    await runCli({
      argv: [ "--reset" ],
      logImpl,
      runAppImpl,
      resetStateImpl,
      packageVersion: "1.0.0",
    });

    expect(resetStateImpl).toHaveBeenCalledTimes(1);
    expect(logImpl).toHaveBeenCalledTimes(1);
    expect(logImpl.mock.calls[ 0 ]?.[ 0 ]).toContain("Configuration reset:");
    expect(runAppImpl).not.toHaveBeenCalled();
  });

  it("arranca la TUI con resumeSessionId cuando recibe resume <sessionId>", async () => {
    const logImpl = vi.fn();
    const runAppImpl = vi.fn();
    const resetStateImpl = vi.fn();

    await runCli({
      argv: [
        "resume",
        "session_20260428010236_6c7ce3f2-264d-41b7-a72b-898fd528e7df",
      ],
      logImpl,
      runAppImpl,
      resetStateImpl,
      packageVersion: "1.0.0",
    });

    expect(runAppImpl).toHaveBeenCalledTimes(1);
    expect(runAppImpl).toHaveBeenCalledWith({
      resumeSessionId:
        "session_20260428010236_6c7ce3f2-264d-41b7-a72b-898fd528e7df",
    });
    expect(logImpl).not.toHaveBeenCalled();
    expect(resetStateImpl).not.toHaveBeenCalled();
  });

  it("muestra uso cuando resume no recibe sessionId", async () => {
    const logImpl = vi.fn();
    const runAppImpl = vi.fn();
    const resetStateImpl = vi.fn();

    await runCli({
      argv: [ "resume" ],
      logImpl,
      runAppImpl,
      resetStateImpl,
      packageVersion: "1.0.0",
    });

    expect(logImpl).toHaveBeenCalledWith("Using: orqent resume <sessionId>");
    expect(runAppImpl).not.toHaveBeenCalled();
    expect(resetStateImpl).not.toHaveBeenCalled();
  });

  it("arranca la TUI cuando no recibe flags", async () => {
    const logImpl = vi.fn();
    const runAppImpl = vi.fn();
    const resetStateImpl = vi.fn();

    await runCli({
      argv: [],
      logImpl,
      runAppImpl,
      resetStateImpl,
      packageVersion: "1.0.0",
    });

    expect(runAppImpl).toHaveBeenCalledTimes(1);
    expect(logImpl).not.toHaveBeenCalled();
    expect(resetStateImpl).not.toHaveBeenCalled();
  });
});
