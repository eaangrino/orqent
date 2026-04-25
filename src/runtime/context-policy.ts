import type { OllamaChatMessage } from "./ollama-runtime.js";

export type ContextPolicyConfig = {
  maxContextMessagesBeforeCompaction: number;
  recentContextMessagesToKeep: number;
  minNewMessagesBeforeNextCompaction: number;
};

export type ContextPolicyPlan = {
  config: ContextPolicyConfig;
  shouldCompact: boolean;
  compactableMessagesCount: number;
  nextCompactedHistoryLength: number;
  messagesToCompact: OllamaChatMessage[];
  liveHistory: OllamaChatMessage[];
};

export type PlanContextUsageInput = {
  history: OllamaChatMessage[];
  compactedHistoryLength: number;
  config?: Partial<ContextPolicyConfig>;
};

export type BuildEffectiveSystemPromptInput = {
  systemPrompt: string;
  contextSummary: string | null;
};

export const DEFAULT_CONTEXT_POLICY_CONFIG: ContextPolicyConfig = {
  maxContextMessagesBeforeCompaction: 10,
  recentContextMessagesToKeep: 6,
  minNewMessagesBeforeNextCompaction: 6,
};

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
  min: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.round(value));
}

export function resolveContextPolicyConfig(
  config: Partial<ContextPolicyConfig> = {},
): ContextPolicyConfig {
  return {
    maxContextMessagesBeforeCompaction: normalizePositiveInteger(
      config.maxContextMessagesBeforeCompaction,
      DEFAULT_CONTEXT_POLICY_CONFIG.maxContextMessagesBeforeCompaction,
      1,
    ),
    recentContextMessagesToKeep: normalizePositiveInteger(
      config.recentContextMessagesToKeep,
      DEFAULT_CONTEXT_POLICY_CONFIG.recentContextMessagesToKeep,
      1,
    ),
    minNewMessagesBeforeNextCompaction: normalizePositiveInteger(
      config.minNewMessagesBeforeNextCompaction,
      DEFAULT_CONTEXT_POLICY_CONFIG.minNewMessagesBeforeNextCompaction,
      1,
    ),
  };
}

export function planContextUsage({
  history,
  compactedHistoryLength,
  config,
}: PlanContextUsageInput): ContextPolicyPlan {
  const resolvedConfig = resolveContextPolicyConfig(config);
  const safeCompactedHistoryLength = normalizePositiveInteger(
    compactedHistoryLength,
    0,
    0,
  );

  const compactableMessagesCount = Math.max(
    0,
    history.length -
    resolvedConfig.recentContextMessagesToKeep -
    safeCompactedHistoryLength,
  );

  const shouldCompact =
    history.length > resolvedConfig.maxContextMessagesBeforeCompaction &&
    compactableMessagesCount >=
    resolvedConfig.minNewMessagesBeforeNextCompaction;

  const nextCompactedHistoryLength = shouldCompact
    ? Math.max(0, history.length - resolvedConfig.recentContextMessagesToKeep)
    : safeCompactedHistoryLength;

  const messagesToCompact = shouldCompact
    ? history.slice(safeCompactedHistoryLength, nextCompactedHistoryLength)
    : [];

  const liveHistory = history.slice(nextCompactedHistoryLength);

  return {
    config: resolvedConfig,
    shouldCompact,
    compactableMessagesCount,
    nextCompactedHistoryLength,
    messagesToCompact,
    liveHistory,
  };
}

export function buildEffectiveSystemPrompt({
  systemPrompt,
  contextSummary,
}: BuildEffectiveSystemPromptInput): string {
  if (!contextSummary) {
    return systemPrompt;
  }

  return `${systemPrompt}

Resumen compactado de la conversación previa:
${contextSummary}`;
}