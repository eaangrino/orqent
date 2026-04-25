import { describe, expect, it, vi } from "vitest";
import { runCli } from "../cli.js";

describe("runCli", () => {
  it("muestra la ayuda cuando recibe --help", async () => {
    const logImpl = vi.fn();
    const runAppImpl = vi.fn();
    const resetStateImpl = vi.fn();

    await runCli({
      argv: ["--help"],
      logImpl,
      runAppImpl,
      resetStateImpl,
      packageVersion: "1.0.0",
    });

    expect(logImpl).toHaveBeenCalledTimes(1);
    expect(logImpl.mock.calls[0]?.[0]).toContain("Usage");
    expect(runAppImpl).not.toHaveBeenCalled();
    expect(resetStateImpl).not.toHaveBeenCalled();
  });

  it("muestra la versión cuando recibe --version", async () => {
    const logImpl = vi.fn();
    const runAppImpl = vi.fn();
    const resetStateImpl = vi.fn();

    await runCli({
      argv: ["--version"],
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
      argv: ["--reset"],
      logImpl,
      runAppImpl,
      resetStateImpl,
      packageVersion: "1.0.0",
    });

    expect(resetStateImpl).toHaveBeenCalledTimes(1);
    expect(logImpl).toHaveBeenCalledTimes(1);
    expect(logImpl.mock.calls[0]?.[0]).toContain("Configuración reiniciada:");
    expect(runAppImpl).not.toHaveBeenCalled();
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
