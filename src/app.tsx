import { Box } from "ink";
import { Layout } from "./components/layout.js";
import { useAppShell } from "./shell/app-shell/use-app-shell.js";
import { useOllamaConnection } from "./models/ollama/use-ollama-connection.js";
import { useOllamaModels } from "./models/ollama/use-ollama-models.js";
import { ConfigSelectScreen } from "./screens/config-select.js";
import { HomeScreen } from "./screens/home.js";
import { ModelSelectScreen } from "./screens/model-select.js";
import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_ORQENT_SYSTEM_PROMPT,
  compactChatHistoryWithOllama,
  loadSystemPrompt,
  streamChatFromOllama,
  type OllamaChatMessage,
} from "./runtime/index.js";
import { appendTranscriptEntry, createSessionId } from "./sessions/index.js";

export function App() {
  // src/app.tsx

  const {
    activeView,
    footerLineA,
    footerLineB,
    footerLineBRightText,
    ollamaHost,
    selectedModel,
    handleBackToHome,
    handleSelectEndpoint,
    handleSelectModel,
    handleSlashCommand,
  } = useAppShell();

  const { models, isLoading, error } = useOllamaModels(ollamaHost);

  const { status: ollamaConnectionStatus, result: ollamaConnectionResult } =
    useOllamaConnection(ollamaHost);

  const ollamaConnectionLabel =
    ollamaConnectionStatus === "checking"
      ? "Conectando..."
      : ollamaConnectionResult?.ok
        ? `Online${ollamaConnectionResult.version ? ` · v${ollamaConnectionResult.version}` : ""} · ${ollamaConnectionResult.latencyMs}ms`
        : `Offline${ollamaConnectionResult?.error ? ` · ${ollamaConnectionResult.error}` : ""}`;

  const [promptStatus, setPromptStatus] = useState<string | null>(null);
  const [hasStartedConversation, setHasStartedConversation] = useState(false);
  const [sessionId] = useState(() => createSessionId());

  const [systemPrompt, setSystemPrompt] = useState(
    DEFAULT_ORQENT_SYSTEM_PROMPT,
  );

  const [contextSummary, setContextSummary] = useState<string | null>(null);
  const [compactedHistoryLength, setCompactedHistoryLength] = useState(0);

  const maxContextMessagesBeforeCompaction = 10;
  const recentContextMessagesToKeep = 6;
  const minNewMessagesBeforeNextCompaction = 6;

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

  const handlePromptSubmit = useCallback(
    async (
      prompt: string,
      history: OllamaChatMessage[],
      onToken: (token: string) => void,
    ) => {
      setHasStartedConversation(true);
      setPromptStatus("Generando respuesta...");

      await appendTranscriptEntry(sessionId, {
        role: "user",
        content: prompt,
        model: selectedModel,
      });

      let effectiveSummary = contextSummary;
      let effectiveCompactedHistoryLength = compactedHistoryLength;

      const compactableMessagesCount = Math.max(
        0,
        history.length - recentContextMessagesToKeep - compactedHistoryLength,
      );

      const shouldCompact =
        history.length > maxContextMessagesBeforeCompaction &&
        compactableMessagesCount >= minNewMessagesBeforeNextCompaction;

      if (shouldCompact) {
        setPromptStatus("Compactando contexto...");

        const nextCompactedHistoryLength = Math.max(
          0,
          history.length - recentContextMessagesToKeep,
        );

        const messagesToCompact = history.slice(
          compactedHistoryLength,
          nextCompactedHistoryLength,
        );

        if (messagesToCompact.length > 0) {
          effectiveSummary = await compactChatHistoryWithOllama({
            host: ollamaHost,
            model: selectedModel,
            previousSummary: contextSummary,
            messages: messagesToCompact,
          });

          effectiveCompactedHistoryLength = nextCompactedHistoryLength;

          setContextSummary(effectiveSummary);
          setCompactedHistoryLength(effectiveCompactedHistoryLength);

          await appendTranscriptEntry(sessionId, {
            role: "system",
            content: effectiveSummary,
            model: selectedModel,
            metadata: {
              type: "context_compaction",
              compactedMessages: messagesToCompact.length,
              compactedHistoryLength: effectiveCompactedHistoryLength,
            },
          });
        }

        setPromptStatus("Generando respuesta...");
      }

      const liveHistory = history.slice(effectiveCompactedHistoryLength);

      const effectiveSystemPrompt = effectiveSummary
        ? `${systemPrompt}

Resumen compactado de la conversación previa:
${effectiveSummary}`
        : systemPrompt;

      try {
        const result = await streamChatFromOllama({
          host: ollamaHost,
          model: selectedModel,
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
          onToken,
        });

        await appendTranscriptEntry(sessionId, {
          role: "assistant",
          content: result.response,
          model: result.model,
        });

        setPromptStatus("Respuesta recibida.");

        return result.response;
      } catch (error_) {
        const message =
          error_ instanceof Error
            ? error_.message
            : "Error desconocido generando respuesta con Ollama";

        await appendTranscriptEntry(sessionId, {
          role: "assistant",
          content: `Error: ${message}`,
          model: selectedModel,
          metadata: {
            error: true,
          },
        });

        setPromptStatus(`Error generando respuesta: ${message}`);
        throw new Error(message);
      }
    },
    [
      ollamaHost,
      selectedModel,
      sessionId,
      systemPrompt,
      contextSummary,
      compactedHistoryLength,
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
            onSelectModel={handleSelectModel}
            onBack={handleBackToHome}
          />
        ) : null}
      </Box>
    </Layout>
  );
}
