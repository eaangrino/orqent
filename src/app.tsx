import { Box } from "ink";
import { Layout } from "./components/layout.js";
import { useAppShell } from "./shell/app-shell/use-app-shell.js";
import { useOllamaConnection } from "./models/ollama/use-ollama-connection.js";
import { useOllamaModels } from "./models/ollama/use-ollama-models.js";
import { ConfigSelectScreen } from "./screens/config-select.js";
import { HomeScreen } from "./screens/home.js";
import { ModelSelectScreen } from "./screens/model-select.js";
import { useCallback, useState } from "react";
import {
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

      try {
        const result = await streamChatFromOllama({
          host: ollamaHost,
          model: selectedModel,
          messages: [
            ...history,
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
    [ollamaHost, selectedModel, sessionId],
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
