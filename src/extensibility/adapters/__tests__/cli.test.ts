import { describe, expect, it } from "vitest";
import { executeCliCommand } from "../cli.js";

describe("executeCliCommand", () => {
  it("ejecuta un comando CLI sin shell", async () => {
    const result = await executeCliCommand({
      command: process.execPath,
      args: [
        "-e",
        "console.log(process.argv.slice(1).join('|'))",
        "hola",
        "orqent",
      ],
      timeoutMs: 5_000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hola|orqent");
    expect(result.stderr).toBe("");
    expect(result.timedOut).toBe(false);
    expect(result.truncated).toBe(false);
  });

  it("envía stdin al proceso", async () => {
    const result = await executeCliCommand({
      command: process.execPath,
      args: [
        "-e",
        "process.stdin.on('data', chunk => process.stdout.write(chunk.toString().toUpperCase()))",
      ],
      stdin: "orqent",
      timeoutMs: 5_000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("ORQENT");
  });

  it("marca timedOut cuando el proceso excede timeoutMs", async () => {
    const result = await executeCliCommand({
      command: process.execPath,
      args: [
        "-e",
        "setTimeout(() => console.log('late'), 1000)",
      ],
      timeoutMs: 100,
    });

    expect(result.exitCode).toBeNull();
    expect(result.timedOut).toBe(true);
  });

  it("trunca stdout cuando supera maxOutputChars", async () => {
    const result = await executeCliCommand({
      command: process.execPath,
      args: [
        "-e",
        "console.log('x'.repeat(5000))",
      ],
      maxOutputChars: 1000,
      timeoutMs: 5_000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toHaveLength(1000);
    expect(result.truncated).toBe(true);
  });

  it("devuelve stderr cuando el comando falla", async () => {
    const result = await executeCliCommand({
      command: process.execPath,
      args: [
        "-e",
        "console.error('falló'); process.exit(2)",
      ],
      timeoutMs: 5_000,
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr.trim()).toBe("falló");
  });
});
