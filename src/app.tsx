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
  readTranscriptEntries,
  upsertChatSessionMetadata,
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
import {
  buildAgentCatalogPrompt,
  listAgentDefinitions,
} from "./agents/index.js";
import {
  buildMcpServerCatalogPrompt,
  listMcpServers,
} from "./extensibility/mcp/index.js";
import { McpServersScreen } from "./screens/mcp-servers.js";

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

function createMessagePreview(content: string, maxLength = 120): string {
  const normalized = content.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

function createChatMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function transcriptEntriesToChatMessages(
  entries: Awaited<ReturnType<typeof readTranscriptEntries>>,
): ChatMessage[] {
  return entries.flatMap((entry) => {
    if (entry.role !== "user" && entry.role !== "assistant") {
      return [];
    }

    return [
      {
        id: entry.id || createChatMessageId(),
        role: entry.role,
        content: entry.content,
        status: null,
      },
    ];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatInspectChildrenFinalResponse(
  result: Awaited<ReturnType<typeof executeModelToolCall>>,
): string | null {
  if (result.kind !== "tool_call_executed") {
    return null;
  }

  if (result.toolCall.toolName !== "agent.inspect_children") {
    return null;
  }

  if (!result.executionResult.ok) {
    return null;
  }

  const payload = result.executionResult.result;

  if (!isRecord(payload)) {
    return null;
  }

  const summary =
    typeof payload.summary === "string" ? payload.summary.trim() : "";
  const children = Array.isArray(payload.children) ? payload.children : [];

  if (!summary) {
    return null;
  }

  const childDetails = children
    .filter(isRecord)
    .map((child, index) => {
      const status = isRecord(child.status) ? child.status : {};
      const transcript = Array.isArray(child.transcript)
        ? child.transcript
        : [];

      const resultText =
        typeof child.result === "string" && child.result.trim()
          ? child.result.trim()
          : null;

      return [
        `## Child ${index + 1}`,
        "",
        `- Agent: \`${String(child.agentIdentifier ?? "unknown")}\``,
        `- Instance ID: \`${String(child.instanceId ?? "unknown")}\``,
        `- Task ID: \`${String(child.taskId ?? "unknown")}\``,
        `- Background Task ID: \`${String(child.backgroundTaskId ?? "none")}\``,
        `- Instance Status: \`${String(status.instance ?? "none")}\``,
        `- Task Status: \`${String(status.task ?? "none")}\``,
        `- Background Status: \`${String(status.background ?? "none")}\``,
        `- Isolated Transcript: ${transcript.length > 0 ? `yes, ${transcript.length} entry(ies)` : "no"}`,
        "",
        resultText
          ? `### Persisted Result\n\n${resultText}`
          : "### Persisted Result\n\nNo persisted result available.",
      ].join("\n");
    })
    .join("\n\n");

  return [
    "Parent-child inspection completed.",
    "",
    summary,
    "",
    childDetails || "There are no child sub-agents for this session.",
  ].join("\n");
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

type AppProps = {
  resumeSessionId?: string;
  onSessionReady?: (sessionId: string) => void;
  onExit?: () => void;
};

export function App({ resumeSessionId, onSessionReady, onExit }: AppProps) {
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
  const [sessionId, setSessionId] = useState(
    () => resumeSessionId ?? createSessionId(),
  );

  useEffect(() => {
    onSessionReady?.(sessionId);
  }, [onSessionReady, sessionId]);

  const [isSessionHydrated, setIsSessionHydrated] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const persistedMessageCountRef = useRef(0);

  const [pendingToolConfirmation, setPendingToolConfirmation] =
    useState<PendingToolConfirmation | null>(null);

  const pendingToolConfirmationRef = useRef<PendingToolConfirmation | null>(
    null,
  );

  const activePromptStatusHandlerRef = useRef<
    ((status: string) => void) | null
  >(null);

  const updateVisiblePromptStatus = useCallback((status: string) => {
    setPromptStatus(status);
    activePromptStatusHandlerRef.current?.(status);
  }, []);

  const persistCurrentSessionMetadata = useCallback(
    async ({
      model,
      lastMessagePreview,
    }: {
      model?: string | null;
      lastMessagePreview?: string | null;
    }) => {
      await upsertChatSessionMetadata({
        id: sessionId,
        cwd: resolveRuntimeCwd(),
        model,
        messageCount: persistedMessageCountRef.current,
        lastMessagePreview,
      });
    },
    [sessionId],
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

  useEffect(() => {
    let isCancelled = false;

    async function hydrateRequestedSession() {
      if (!resumeSessionId) {
        setIsSessionHydrated(true);
        return;
      }

      const transcriptEntries = await readTranscriptEntries(resumeSessionId);

      if (isCancelled) {
        return;
      }

      setSessionId(resumeSessionId);
      setMessages(transcriptEntriesToChatMessages(transcriptEntries));
      persistedMessageCountRef.current = transcriptEntries.filter(
        (entry) => entry.role === "user" || entry.role === "assistant",
      ).length;
      setHasStartedConversation(transcriptEntries.length > 0);
      setIsSessionHydrated(true);
    }

    void hydrateRequestedSession();

    return () => {
      isCancelled = true;
    };
  }, [resumeSessionId]);

  useEffect(() => {
    if (!isSessionHydrated) {
      return;
    }

    void persistCurrentSessionMetadata({
      model: activeModel || null,
      lastMessagePreview: null,
    });
  }, [activeModel, isSessionHydrated, persistCurrentSessionMetadata]);

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
      updateVisiblePromptStatus(formatToolConfirmationPrompt(request));

      return new Promise<ToolConfirmationDecision>((resolve) => {
        const pendingConfirmation: PendingToolConfirmation = {
          request,
          resolve,
        };

        pendingToolConfirmationRef.current = pendingConfirmation;
        setPendingToolConfirmation(pendingConfirmation);
      });
    },
    [updateVisiblePromptStatus],
  );

  const handleAppSlashCommand = useCallback(
    (command: string) => {
      const normalizedCommand = command.trim().toLowerCase();

      if (normalizedCommand === "/exit" || normalizedCommand === "/quit") {
        onExit?.();
        return true;
      }

      return handleSlashCommand(command);
    },
    [handleSlashCommand, onExit],
  );

  const handlePromptSubmit = useCallback(
    async (
      prompt: string,
      history: OllamaChatMessage[],
      onToken: (token: string) => void,
      onStatus: (status: string) => void,
      onReplaceContent: (content: string) => void,
    ) => {
      if (!isOllamaConfigHydrated) {
        throw new Error("The Ollama configuration is still loading.");
      }

      if (!isSessionHydrated) {
        throw new Error("The chat session is still loading.");
      }

      if (!activeModel) {
        throw new Error("No active model selected. Use /model.");
      }

      activePromptStatusHandlerRef.current = onStatus;

      const updatePromptStatus = (status: string) => {
        updateVisiblePromptStatus(status);
      };

      setHasStartedConversation(true);
      updatePromptStatus(`Generating a response with ${activeModel}...`);

      await appendTranscriptEntry(sessionId, {
        role: "user",
        content: prompt,
        model: activeModel,
      });

      persistedMessageCountRef.current += 1;

      await persistCurrentSessionMetadata({
        model: activeModel,
        lastMessagePreview: createMessagePreview(prompt),
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

      const agentDefinitions = await listAgentDefinitions();
      const mcpServers = await listMcpServers();

      const effectiveSystemPrompt = [
        baseEffectiveSystemPrompt,
        "",
        buildRuntimeContextPrompt(),
        "",
        buildAgentCatalogPrompt(agentDefinitions),
        "",
        buildMcpServerCatalogPrompt(mcpServers),
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
          let streamedResponse = "";
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
            onToken: (token) => {
              streamedResponse += token;

              if (!streamedResponse.includes("<orqent_tool_call")) {
                onToken(token);
              }
            },
          });

          finalModel = result.model;

          const toolCallParseResult = parseModelToolCall(result.response, {
            allowSurroundingText: true,
          });

          if (toolCallParseResult.kind !== "none") {
            onReplaceContent("");
          }

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
            runtime: {
              ollamaHost,
              activeModel,
              generationOptions,
              thinkingMode,
            },
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

          const deterministicResponse =
            formatInspectChildrenFinalResponse(toolExecution);

          if (deterministicResponse) {
            finalResponse = deterministicResponse;
            break;
          }

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

        persistedMessageCountRef.current += 1;

        await persistCurrentSessionMetadata({
          model: finalModel,
          lastMessagePreview: createMessagePreview(finalResponse),
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

        persistedMessageCountRef.current += 1;

        await persistCurrentSessionMetadata({
          model: activeModel,
          lastMessagePreview: createMessagePreview(`Error: ${message}`),
        });

        updatePromptStatus(`Error generating response: ${message}`);
        throw new Error(message);
      } finally {
        activePromptStatusHandlerRef.current = null;
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
      updateVisiblePromptStatus,
      isSessionHydrated,
    ],
  );

  useInput((input, key) => {
    if (key.ctrl && input.toLowerCase() === "c") {
      onExit?.();
    }
  });

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
        updateVisiblePromptStatus(
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
        updateVisiblePromptStatus(
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
            onSlashCommand={handleAppSlashCommand}
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

        {activeView === "mcp" ? (
          <McpServersScreen onBack={handleBackToHome} />
        ) : null}
      </Box>
    </Layout>
  );
}
