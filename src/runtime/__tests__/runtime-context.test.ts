import { describe, expect, it } from "vitest";
import {
  buildRuntimeContextPrompt,
  resolveRuntimeCwd,
} from "../index.js";

describe("runtime context prompt", () => {
  it("incluye cwd como directorio y proyecto actual", () => {
    const prompt = buildRuntimeContextPrompt({
      cwd: "/tmp/orqent-project",
    });

    expect(prompt).toContain("Current working directory: /tmp/orqent-project");
    expect(prompt).toContain(
      "Current project/workspace/repository root for this turn: /tmp/orqent-project",
    );
  });

  it("declara que proyecto/repo/workspace apuntan al cwd", () => {
    const prompt = buildRuntimeContextPrompt({
      cwd: "/tmp/orqent-project",
    });

    expect(prompt).toContain("current project");
    expect(prompt).toContain("this repo");
    expect(prompt).toContain("workspace");
    expect(prompt).toContain("el proyecto");
    expect(prompt).toContain("la ruta actual");
  });

  it("obliga a usar tools antes de diagnosticar el proyecto", () => {
    const prompt = buildRuntimeContextPrompt({
      cwd: "/tmp/orqent-project",
    });

    expect(prompt).toContain(
      "you must use available read/search/list tools before giving a diagnosis",
    );
    expect(prompt).toContain("package.json");
    expect(prompt).toContain("tsconfig");
    expect(prompt).toContain("source folders");
  });

  it("resolveRuntimeCwd normaliza paths válidos", () => {
    expect(resolveRuntimeCwd(process.cwd())).toBe(process.cwd().normalize("NFC"));
  });
});
