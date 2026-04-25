import { describe, expect, it } from "vitest";
import {
  buildEffectiveSystemPrompt,
  planContextUsage,
  resolveContextPolicyConfig,
  type ContextPolicyConfig,
} from "../context-policy.js";
import type { OllamaChatMessage } from "../ollama-runtime.js";

function createHistory(length: number): OllamaChatMessage[] {
  return Array.from({ length }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `message-${index + 1}`,
  }));
}

describe("context-policy", () => {
  it("normaliza configuración inválida usando defaults seguros", () => {
    const config = resolveContextPolicyConfig({
      maxContextMessagesBeforeCompaction: Number.NaN,
      recentContextMessagesToKeep: -10,
      minNewMessagesBeforeNextCompaction: 0,
    });

    expect(config).toEqual({
      maxContextMessagesBeforeCompaction: 10,
      recentContextMessagesToKeep: 1,
      minNewMessagesBeforeNextCompaction: 1,
    });
  });

  it("no compacta cuando el historial no supera el umbral", () => {
    const history = createHistory(10);

    const plan = planContextUsage({
      history,
      compactedHistoryLength: 0,
    });

    expect(plan.shouldCompact).toBe(false);
    expect(plan.messagesToCompact).toEqual([]);
    expect(plan.liveHistory).toEqual(history);
    expect(plan.nextCompactedHistoryLength).toBe(0);
  });

  it("compacta mensajes viejos y conserva los mensajes recientes", () => {
    const history = createHistory(12);

    const plan = planContextUsage({
      history,
      compactedHistoryLength: 0,
    });

    expect(plan.shouldCompact).toBe(true);
    expect(plan.messagesToCompact.map((message) => message.content)).toEqual([
      "message-1",
      "message-2",
      "message-3",
      "message-4",
      "message-5",
      "message-6",
    ]);
    expect(plan.liveHistory.map((message) => message.content)).toEqual([
      "message-7",
      "message-8",
      "message-9",
      "message-10",
      "message-11",
      "message-12",
    ]);
    expect(plan.nextCompactedHistoryLength).toBe(6);
  });

  it("no recompácta si no hay suficientes mensajes nuevos", () => {
    const history = createHistory(14);

    const plan = planContextUsage({
      history,
      compactedHistoryLength: 6,
    });

    expect(plan.shouldCompact).toBe(false);
    expect(plan.messagesToCompact).toEqual([]);
    expect(plan.liveHistory.map((message) => message.content)).toEqual([
      "message-7",
      "message-8",
      "message-9",
      "message-10",
      "message-11",
      "message-12",
      "message-13",
      "message-14",
    ]);
  });

  it("respeta configuración custom de política de contexto", () => {
    const history = createHistory(8);

    const config: ContextPolicyConfig = {
      maxContextMessagesBeforeCompaction: 6,
      recentContextMessagesToKeep: 3,
      minNewMessagesBeforeNextCompaction: 2,
    };

    const plan = planContextUsage({
      history,
      compactedHistoryLength: 0,
      config,
    });

    expect(plan.shouldCompact).toBe(true);
    expect(plan.messagesToCompact.map((message) => message.content)).toEqual([
      "message-1",
      "message-2",
      "message-3",
      "message-4",
      "message-5",
    ]);
    expect(plan.liveHistory.map((message) => message.content)).toEqual([
      "message-6",
      "message-7",
      "message-8",
    ]);
    expect(plan.config).toEqual(config);
  });

  it("construye system prompt con resumen compactado cuando existe", () => {
    const result = buildEffectiveSystemPrompt({
      systemPrompt: "base system prompt",
      contextSummary: "decisiones previas",
    });

    expect(result).toContain("base system prompt");
    expect(result).toContain("Resumen compactado de la conversación previa:");
    expect(result).toContain("decisiones previas");
  });

  it("devuelve system prompt intacto cuando no hay resumen", () => {
    const result = buildEffectiveSystemPrompt({
      systemPrompt: "base system prompt",
      contextSummary: null,
    });

    expect(result).toBe("base system prompt");
  });
});