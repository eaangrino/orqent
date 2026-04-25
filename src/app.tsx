import { Box } from "ink";
import { Layout } from "./components/layout.js";
import { useAppShell } from "./shell/app-shell/use-app-shell.js";
import { useOllamaConnection } from "./models/ollama/use-ollama-connection.js";
import { useOllamaModels } from "./models/ollama/use-ollama-models.js";
import { ConfigSelectScreen } from "./screens/config-select.js";
import { HomeScreen, type ChatMessage } from "./screens/home.js";
import { ModelSelectScreen } from "./screens/model-select.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_ORQENT_SYSTEM_PROMPT,
  buildEffectiveSystemPrompt,
  compactChatHistoryWithOllama,
  loadSystemPrompt,
  planContextUsage,
  streamChatFromOllama,
  type OllamaChatMessage,
} from "./runtime/index.js";
import { appendTranscriptEntry, createSessionId } from "./sessions/index.js";
import { GenerationOptionsScreen } from "./screens/generation-options.js";
import { ThinkingModeScreen } from "./screens/thinking-mode.js";
import { PermissionModeScreen } from "./screens/permission-mode.js";

export function App() {
  // src/app.tsx

  const {
    activeView,
    footerLineA,
    footerLineB,
    footerLineBRightText,
    ollamaHost,
    selectedModel,
    generationOptions,
    setGenerationOptions,
    thinkingMode,
    setThinkingMode,
    permissionMode,
    setPermissionMode,
    permissionPolicy,
    isOllamaConfigHydrated,
    handleBackToHome,
    handleSelectEndpoint,
    handleSelectModel,
    handleSlashCommand,
  } = useAppShell();

  void permissionPolicy; // Temporal typed export to avoid unused variable warning, will be used in future iterations when permissions are enforced.

  const { models, isLoading, error } = useOllamaModels(ollamaHost);

  const { status: ollamaConnectionStatus, result: ollamaConnectionResult } =
    useOllamaConnection(ollamaHost);

  const ollamaConnectionLabel =
    ollamaConnectionStatus === "checking"
      ? "Conectando..."
      : ollamaConnectionResult?.ok
        ? `Online${ollamaConnectionResult.version ? ` · v${ollamaConnectionResult.version}` : ""} · ${ollamaConnectionResult.latencyMs}ms`
        : `Offline${ollamaConnectionResult?.error ? ` · ${ollamaConnectionResult.error}` : ""}`;
  const activeModel = useMemo(() => selectedModel.trim(), [selectedModel]);

  const [promptStatus, setPromptStatus] = useState<string | null>(null);
  const [hasStartedConversation, setHasStartedConversation] = useState(false);
  const [sessionId] = useState(() => createSessionId());
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [systemPrompt, setSystemPrompt] = useState(
    DEFAULT_ORQENT_SYSTEM_PROMPT,
  );

  const [contextSummary, setContextSummary] = useState<string | null>(null);
  const [compactedHistoryLength, setCompactedHistoryLength] = useState(0);

  const contextStatus = useMemo(() => {
    const liveMessages = Math.max(0, messages.length - compactedHistoryLength);
    const summaryState = contextSummary ? "con resumen" : "sin resumen";

    return `Contexto: ${liveMessages} vivos · ${compactedHistoryLength} compactados · ${summaryState}`;
  }, [messages.length, compactedHistoryLength, contextSummary]);

  useEffect(() => {
    let isCancelled = false;

    async function hydrateSystemPrompt() {
      const nextSystemPrompt = await loadSystemPrompt();

      if (!isCancelled) {
        setSystemPrompt(nextSystemPrompt);
      }
    }

    void hydrateSystemPrompt();

    return () => {
      isCancelled = true;
    };
  }, []);

  const handleModelSwitch = useCallback(
    (nextModel: string) => {
      const previousModel = activeModel;

      handleSelectModel(nextModel);

      if (previousModel === nextModel) {
        return;
      }

      setPromptStatus(`Modelo cambiado: ${previousModel} → ${nextModel}`);

      void appendTranscriptEntry(sessionId, {
        role: "system",
        content: `Model switched from ${previousModel} to ${nextModel}.`,
        model: nextModel,
        metadata: {
          type: "model_switch",
          previousModel,
          nextModel,
        },
      });
    },
    [activeModel, handleSelectModel, sessionId],
  );

  const handlePromptSubmit = useCallback(
    async (
      prompt: string,
      history: OllamaChatMessage[],
      onToken: (token: string) => void,
    ) => {
      if (!isOllamaConfigHydrated) {
        throw new Error("The Ollama configuration is still loading.");
      }

      if (!activeModel) {
        throw new Error("No active model selected. Use /model.");
      }
      setHasStartedConversation(true);
      setPromptStatus(`Generating a response with ${activeModel}...`);

      await appendTranscriptEntry(sessionId, {
        role: "user",
        content: prompt,
        model: activeModel,
      });

      let effectiveSummary = contextSummary;
      let effectiveCompactedHistoryLength = compactedHistoryLength;

      const contextPlan = planContextUsage({
        history,
        compactedHistoryLength,
      });

      if (contextPlan.shouldCompact) {
        setPromptStatus("Compactando contexto...");

        if (contextPlan.messagesToCompact.length > 0) {
          effectiveSummary = await compactChatHistoryWithOllama({
            host: ollamaHost,
            model: activeModel,
            previousSummary: contextSummary,
            messages: contextPlan.messagesToCompact,
            generationOptions,
          });

          effectiveCompactedHistoryLength =
            contextPlan.nextCompactedHistoryLength;

          setContextSummary(effectiveSummary);
          setCompactedHistoryLength(effectiveCompactedHistoryLength);

          await appendTranscriptEntry(sessionId, {
            role: "system",
            content: effectiveSummary,
            model: activeModel,
            metadata: {
              type: "context_compaction",
              compactedMessages: contextPlan.messagesToCompact.length,
              compactedHistoryLength: effectiveCompactedHistoryLength,
              liveHistoryLength: contextPlan.liveHistory.length,
              policy: contextPlan.config,
            },
          });
        }

        setPromptStatus(`Generating a response with ${activeModel}...`);
      }

      const liveHistory = contextPlan.shouldCompact
        ? contextPlan.liveHistory
        : history.slice(effectiveCompactedHistoryLength);

      const effectiveSystemPrompt = buildEffectiveSystemPrompt({
        systemPrompt,
        contextSummary: effectiveSummary,
      });

      try {
        const result = await streamChatFromOllama({
          host: ollamaHost,
          model: activeModel,
          messages: [
            {
              role: "system",
              content: effectiveSystemPrompt,
            },
            ...liveHistory,
            {
              role: "user",
              content: prompt,
            },
          ],
          generationOptions,
          thinkingMode,
          onToken,
        });

        await appendTranscriptEntry(sessionId, {
          role: "assistant",
          content: result.response,
          model: result.model,
        });

        setPromptStatus("Response received.");

        return result.response;
      } catch (error_) {
        const message =
          error_ instanceof Error
            ? error_.message
            : "Unknown error generating response with Ollama";

        await appendTranscriptEntry(sessionId, {
          role: "assistant",
          content: `Error: ${message}`,
          model: activeModel,
          metadata: {
            error: true,
          },
        });

        setPromptStatus(`Error generating response: ${message}`);
        throw new Error(message);
      }
    },
    [
      ollamaHost,
      activeModel,
      isOllamaConfigHydrated,
      sessionId,
      systemPrompt,
      contextSummary,
      compactedHistoryLength,
      generationOptions,
      thinkingMode,
    ],
  );

  return (
    // src/app.tsx

    <Layout
      topLeftText="soy izquierda"
      topRightText={`vista: ${activeView}`}
      footerLineA={footerLineA}
      footerLineB={`${footerLineB} · ${ollamaConnectionLabel}`}
      footerLineBRightText={footerLineBRightText}
      hideBrand={hasStartedConversation}>
      <Box width="100%" flexDirection="column" alignItems="center">
        {activeView === "home" ? (
          <HomeScreen
            messages={messages}
            setMessages={setMessages}
            contextStatus={contextStatus}
            onSlashCommand={handleSlashCommand}
            onPromptSubmit={handlePromptSubmit}
            promptStatus={promptStatus}
          />
        ) : null}

        {activeView === "config" ? (
          <ConfigSelectScreen
            selectedOllamaHost={ollamaHost}
            onSelectEndpoint={handleSelectEndpoint}
            onBack={handleBackToHome}
          />
        ) : null}

        {activeView === "model" ? (
          <ModelSelectScreen
            models={models}
            selectedModel={selectedModel}
            isLoading={isLoading}
            error={error}
            onSelectModel={handleModelSwitch}
            onBack={handleBackToHome}
          />
        ) : null}

        {activeView === "params" ? (
          <GenerationOptionsScreen
            generationOptions={generationOptions}
            onChangeGenerationOptions={setGenerationOptions}
            onBack={handleBackToHome}
          />
        ) : null}

        {activeView === "thinking" ? (
          <ThinkingModeScreen
            thinkingMode={thinkingMode}
            onChangeThinkingMode={setThinkingMode}
            onBack={handleBackToHome}
          />
        ) : null}

        {activeView === "permissions" ? (
          <PermissionModeScreen
            permissionMode={permissionMode}
            onChangePermissionMode={setPermissionMode}
            onBack={handleBackToHome}
          />
        ) : null}
      </Box>
    </Layout>
  );
}
