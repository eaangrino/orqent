import { Box, useInput } from "ink";
import { Layout } from "./components/layout.js";
import { useAppShell } from "./shell/app-shell/use-app-shell.js";
import { useOllamaConnection } from "./models/ollama/use-ollama-connection.js";
import { useOllamaModels } from "./models/ollama/use-ollama-models.js";
import { ConfigSelectScreen } from "./screens/config-select.js";
import { HomeScreen, type ChatMessage } from "./screens/home.js";
import { ModelSelectScreen } from "./screens/model-select.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_ORQENT_SYSTEM_PROMPT,
  buildEffectiveSystemPrompt,
  buildToolCallProtocolInstructions,
  buildToolResultMessage,
  compactChatHistoryWithOllama,
  executeModelToolCall,
  loadSystemPrompt,
  parseModelToolCall,
  planContextUsage,
  streamChatFromOllama,
  type OllamaChatMessage,
} from "./runtime/index.js";
import {
  appendToolActionEntry,
  appendTranscriptEntry,
  createSessionId,
} from "./sessions/index.js";
import { GenerationOptionsScreen } from "./screens/generation-options.js";
import { ThinkingModeScreen } from "./screens/thinking-mode.js";
import { PermissionModeScreen } from "./screens/permission-mode.js";
import {
  defaultToolRegistry,
  type ToolActionLogEntry,
  type ToolConfirmationDecision,
  type ToolConfirmationRequest,
} from "./tools/index.js";
import { realpathSync } from "node:fs";

const MAX_TOOL_CALL_ROUNDS_PER_PROMPT = 10;

function resolveRuntimeCwd() {
  try {
    return realpathSync(process.cwd()).normalize("NFC");
  } catch {
    return process.cwd().normalize("NFC");
  }
}

function buildRuntimeContextPrompt() {
  return [
    "Runtime context:",
    `- Current working directory: ${resolveRuntimeCwd()}`,
    "",
    "Runtime context rules:",
    "- If the user asks for the current project path, current directory, working directory, answer directly using the current working directory above.",
    "- Do not ask the user to run pwd when the current working directory is already provided in runtime context.",
    "- Use tools only when the answer requires inspecting files, reading content, searching project text, or executing an action.",
  ].join("\n");
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return JSON.stringify({
      error: "Value could not be serialized.",
    });
  }
}

function formatToolExecutionFallbackResponse({
  toolName,
  result,
}: {
  toolName: string;
  result: Awaited<ReturnType<typeof executeModelToolCall>>;
}): string | null {
  if (result.kind === "none") {
    return null;
  }

  if (result.kind === "invalid_tool_call") {
    return [
      "The model attempted to call a tool, but the format was invalid.",
      `Tool name: ${toolName}`,
      "",
      `Error: ${result.parseResult.error}`,
    ].join("\n");
  }

  if (result.executionResult.ok) {
    return [
      `Tool executed: ${toolName}`,
      "",
      "Result:",
      "```json",
      safeJsonStringify(result.executionResult.result),
      "```",
    ].join("\n");
  }

  return [
    `Tool blocked or failed: ${toolName}`,
    "",
    `Code: ${result.executionResult.error.code}`,
    `Message: ${result.executionResult.error.message}`,
  ].join("\n");
}

function formatToolRoundLimitResponse(): string {
  return [
    "The model attempted to request another tool, but Orqent stopped the cycle.",
    "",
    `Current limit: ${MAX_TOOL_CALL_ROUNDS_PER_PROMPT} round of tool calling per prompt.`,
    "",
    "This prevents execution loops while the agent loop continues to mature.",
  ].join("\n");
}

async function persistToolActionEntry(
  entry: ToolActionLogEntry,
): Promise<void> {
  await appendToolActionEntry(entry.sessionId, {
    toolName: entry.toolName,
    cwd: entry.cwd,
    input: entry.input,
    status: entry.status,
    ok: entry.ok,
    durationMs: entry.durationMs,
    risk: entry.risk,
    permissions: entry.permissions,
    requiresConfirmation: entry.requiresConfirmation,
    isReadOnly: entry.isReadOnly,
    permissionEffect: entry.permissionEffect,
    permissionReason: entry.permissionReason,
    confirmation: entry.confirmation,
    errorCode: entry.errorCode,
    errorMessage: entry.errorMessage,
    metadata: entry.metadata,
  });
}

type PendingToolConfirmation = {
  request: ToolConfirmationRequest;
  resolve: (decision: ToolConfirmationDecision) => void;
};

function formatToolConfirmationPrompt(
  request: ToolConfirmationRequest,
): string {
  return [
    `Tool requires confirmation: ${request.toolName}`,
    `Risk: ${request.risk}`,
    `Permissions: ${request.permissions.join(", ") || "none"}`,
    `Reason: ${request.reason}`,
    "Press y to allow or n to deny.",
  ].join(" · ");
}

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

  const [pendingToolConfirmation, setPendingToolConfirmation] =
    useState<PendingToolConfirmation | null>(null);

  const pendingToolConfirmationRef = useRef<PendingToolConfirmation | null>(
    null,
  );

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

      setPromptStatus(`Model switched: ${previousModel} → ${nextModel}`);

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

  const handleConfirmToolExecution = useCallback(
    async (
      request: ToolConfirmationRequest,
    ): Promise<ToolConfirmationDecision> => {
      setPromptStatus(formatToolConfirmationPrompt(request));

      return new Promise<ToolConfirmationDecision>((resolve) => {
        const pendingConfirmation: PendingToolConfirmation = {
          request,
          resolve,
        };

        pendingToolConfirmationRef.current = pendingConfirmation;
        setPendingToolConfirmation(pendingConfirmation);
      });
    },
    [],
  );

  const handlePromptSubmit = useCallback(
    async (
      prompt: string,
      history: OllamaChatMessage[],
      onToken: (token: string) => void,
      onStatus: (status: string) => void,
    ) => {
      if (!isOllamaConfigHydrated) {
        throw new Error("The Ollama configuration is still loading.");
      }

      if (!activeModel) {
        throw new Error("No active model selected. Use /model.");
      }

      void onToken;

      const updatePromptStatus = (status: string) => {
        setPromptStatus(status);
        onStatus(status);
      };

      setHasStartedConversation(true);
      updatePromptStatus(`Generating a response with ${activeModel}...`);

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
        updatePromptStatus("Compacting context...");

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

        updatePromptStatus(`Generating a response with ${activeModel}...`);
      }

      const liveHistory = contextPlan.shouldCompact
        ? contextPlan.liveHistory
        : history.slice(effectiveCompactedHistoryLength);

      const baseEffectiveSystemPrompt = buildEffectiveSystemPrompt({
        systemPrompt,
        contextSummary: effectiveSummary,
      });

      const effectiveSystemPrompt = [
        baseEffectiveSystemPrompt,
        "",
        buildRuntimeContextPrompt(),
        "",
        buildToolCallProtocolInstructions(defaultToolRegistry.list()),
      ].join("\n");

      try {
        updatePromptStatus(`Analyzing request with ${activeModel}...`);

        let modelMessages: OllamaChatMessage[] = [
          ...liveHistory,
          {
            role: "user",
            content: prompt,
          },
        ];

        let finalResponse = "";
        let finalModel = activeModel;
        let lastToolExecution: Awaited<
          ReturnType<typeof executeModelToolCall>
        > | null = null;
        let toolRoundsUsed = 0;
        let stoppedByToolRoundLimit = false;
        const executedToolNames: string[] = [];

        while (true) {
          const result = await streamChatFromOllama({
            host: ollamaHost,
            model: activeModel,
            messages: [
              {
                role: "system",
                content: effectiveSystemPrompt,
              },
              ...modelMessages,
            ],
            generationOptions,
            thinkingMode,
            onToken: () => {
              // Internal response: may contain tool call XML.
              // Not displayed directly on screen.
            },
          });

          finalModel = result.model;

          const toolCallParseResult = parseModelToolCall(result.response, {
            allowSurroundingText: true,
          });

          if (toolCallParseResult.kind === "none") {
            finalResponse = result.response;
            break;
          }

          if (toolCallParseResult.kind === "invalid") {
            lastToolExecution = {
              kind: "invalid_tool_call",
              parseResult: toolCallParseResult,
            };

            finalResponse =
              formatToolExecutionFallbackResponse({
                toolName: "unknown",
                result: lastToolExecution,
              }) ?? result.response;

            break;
          }

          if (toolRoundsUsed >= MAX_TOOL_CALL_ROUNDS_PER_PROMPT) {
            stoppedByToolRoundLimit = true;
            updatePromptStatus("Tool calling stopped by round limit.");
            finalResponse = formatToolRoundLimitResponse();
            break;
          }

          updatePromptStatus(
            `Tool requested: ${toolCallParseResult.toolCall.toolName}. Executing...`,
          );

          const toolExecution = await executeModelToolCall({
            modelResponse: result.response,
            registry: defaultToolRegistry,
            sessionId,
            cwd: process.cwd(),
            permissionPolicy,
            confirmToolExecution: handleConfirmToolExecution,
            toolActionLogger: persistToolActionEntry,
            parseOptions: {
              allowSurroundingText: true,
            },
          });

          lastToolExecution = toolExecution;

          if (toolExecution.kind !== "tool_call_executed") {
            finalResponse =
              formatToolExecutionFallbackResponse({
                toolName: "unknown",
                result: toolExecution,
              }) ?? result.response;

            break;
          }

          toolRoundsUsed++;
          executedToolNames.push(toolExecution.toolCall.toolName);

          const toolResultMessage = buildToolResultMessage({
            toolName: toolExecution.toolCall.toolName,
            input: toolExecution.toolCall.input,
            result: toolExecution.executionResult,
          });

          updatePromptStatus(
            toolExecution.executionResult.ok
              ? `Tool executed: ${toolExecution.toolCall.toolName}. Continuing...`
              : `Tool failed or was blocked: ${toolExecution.toolCall.toolName}. Continuing...`,
          );

          modelMessages = [
            ...modelMessages,
            {
              role: "assistant",
              content: result.response,
            },
            toolResultMessage,
          ];
        }

        if (!finalResponse.trim()) {
          finalResponse = "(empty response)";
        }

        await appendTranscriptEntry(sessionId, {
          role: "assistant",
          content: finalResponse,
          model: finalModel,
          metadata:
            lastToolExecution === null && executedToolNames.length === 0
              ? undefined
              : {
                  type: "tool_call_execution",
                  toolExecutionKind: stoppedByToolRoundLimit
                    ? "tool_round_limit_reached"
                    : lastToolExecution?.kind,
                  toolName:
                    lastToolExecution?.kind === "tool_call_executed"
                      ? lastToolExecution.toolCall.toolName
                      : null,
                  toolNames: executedToolNames,
                  toolRoundsUsed,
                  maxToolCallRounds: MAX_TOOL_CALL_ROUNDS_PER_PROMPT,
                },
        });

        updatePromptStatus(
          stoppedByToolRoundLimit
            ? "Response stopped by tool round limit."
            : executedToolNames.length > 0
              ? `Response generated with tools: ${executedToolNames.join(", ")}`
              : "Response received.",
        );

        return finalResponse;
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

        updatePromptStatus(`Error generating response: ${message}`);
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
      permissionPolicy,
      generationOptions,
      thinkingMode,
      handleConfirmToolExecution,
    ],
  );

  useInput(
    (input) => {
      const pendingConfirmation = pendingToolConfirmationRef.current;

      if (!pendingConfirmation) {
        return;
      }

      const normalizedInput = input.trim().toLowerCase();

      if (normalizedInput === "y" || normalizedInput === "s") {
        pendingConfirmation.resolve({
          allowed: true,
        });

        pendingToolConfirmationRef.current = null;
        setPendingToolConfirmation(null);
        setPromptStatus(
          `Tool approved: ${pendingConfirmation.request.toolName}. Executing...`,
        );
        return;
      }

      if (normalizedInput === "n") {
        pendingConfirmation.resolve({
          allowed: false,
          reason:
            "User denied tool execution from the TUI confirmation prompt.",
        });

        pendingToolConfirmationRef.current = null;
        setPendingToolConfirmation(null);
        setPromptStatus(
          `Tool denied: ${pendingConfirmation.request.toolName}.`,
        );
      }
    },
    {
      isActive: pendingToolConfirmation !== null,
    },
  );

  return (
    // src/app.tsx

    <Layout
      topLeftText="Powered by eaangrino"
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
