import { realpathSync } from "node:fs";
import { ToolRegistry } from "./registry.js";
import type {
  ToolConfirmationHandler,
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolRetryConfig,
} from "./types.js";

export type ExecuteToolInput = {
  registry: ToolRegistry;
  toolName: string;
  input: unknown;
  sessionId: string;
  cwd?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  confirmToolExecution?: ToolConfirmationHandler;
};

const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

const DEFAULT_TOOL_RETRY_CONFIG: ToolRetryConfig = {
  maxAttempts: 1,
  delayMs: 0,
  retryableErrorCodes: [ "tool_execution_failed", "tool_aborted" ],
};

function resolveCwd(cwd: string | undefined): string {
  try {
    return realpathSync(cwd ?? process.cwd()).normalize("NFC");
  } catch {
    return (cwd ?? process.cwd()).normalize("NFC");
  }
}

function createTimeoutSignal(
  timeoutMs: number,
  parentSignal: AbortSignal | undefined,
): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Tool execution timed out after ${timeoutMs}ms.`));
  }, timeoutMs);

  const abortFromParent = () => {
    controller.abort(parentSignal?.reason);
  };

  if (parentSignal) {
    if (parentSignal.aborted) {
      abortFromParent();
    } else {
      parentSignal.addEventListener("abort", abortFromParent, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
  };
}

function createToolError(
  code: string,
  message: string,
  details?: unknown,
  metadata?: Record<string, unknown>,
): ToolExecutionResult {
  return {
    ok: false,
    error: {
      code,
      message,
      details,
    },
    metadata,
  };
}

function getExecutionTimeoutMs(
  tool: ToolDefinition,
  overrideTimeoutMs: number | undefined,
): number {
  const rawTimeout = overrideTimeoutMs ?? tool.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;

  if (!Number.isFinite(rawTimeout) || rawTimeout <= 0) {
    return DEFAULT_TOOL_TIMEOUT_MS;
  }

  return Math.round(rawTimeout);
}

function normalizeRetryConfig(tool: ToolDefinition): ToolRetryConfig {
  const maxAttempts = tool.retry?.maxAttempts ?? DEFAULT_TOOL_RETRY_CONFIG.maxAttempts;
  const delayMs = tool.retry?.delayMs ?? DEFAULT_TOOL_RETRY_CONFIG.delayMs;

  return {
    maxAttempts:
      Number.isFinite(maxAttempts) && maxAttempts > 0
        ? Math.min(5, Math.round(maxAttempts))
        : DEFAULT_TOOL_RETRY_CONFIG.maxAttempts,
    delayMs:
      Number.isFinite(delayMs) && delayMs > 0
        ? Math.min(10_000, Math.round(delayMs))
        : DEFAULT_TOOL_RETRY_CONFIG.delayMs,
    retryableErrorCodes:
      tool.retry?.retryableErrorCodes ??
      DEFAULT_TOOL_RETRY_CONFIG.retryableErrorCodes,
  };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(resolve, ms);

    const abort = () => {
      clearTimeout(timeoutId);
      reject(signal.reason);
    };

    signal.addEventListener("abort", abort, { once: true });
  });
}

function withAttemptMetadata(
  result: ToolExecutionResult,
  attempt: number,
  maxAttempts: number,
): ToolExecutionResult {
  return {
    ...result,
    metadata: {
      ...result.metadata,
      attempts: attempt,
      maxAttempts,
    },
  };
}

function canRetryResult(
  result: ToolExecutionResult,
  retryConfig: ToolRetryConfig,
  attempt: number,
): boolean {
  if (result.ok) {
    return false;
  }

  if (attempt >= retryConfig.maxAttempts) {
    return false;
  }

  return Boolean(retryConfig.retryableErrorCodes?.includes(result.error.code));
}

function getConfirmationReason(tool: ToolDefinition): string {
  if (tool.requiresConfirmation) {
    return `Tool "${tool.name}" requires explicit confirmation.`;
  }

  if (tool.risk === "high" || tool.risk === "critical") {
    return `Tool "${tool.name}" has ${tool.risk} risk.`;
  }

  if (!tool.isReadOnly) {
    return `Tool "${tool.name}" can modify external state.`;
  }

  return `Tool "${tool.name}" can execute with current permissions.`;
}

function shouldRequireConfirmation(tool: ToolDefinition): boolean {
  return (
    tool.requiresConfirmation ||
    tool.risk === "high" ||
    tool.risk === "critical" ||
    !tool.isReadOnly
  );
}

async function ensureToolConfirmed({
  tool,
  input,
  confirmToolExecution,
}: {
  tool: ToolDefinition;
  input: unknown;
  confirmToolExecution: ToolConfirmationHandler | undefined;
}): Promise<ToolExecutionResult | null> {
  if (!shouldRequireConfirmation(tool)) {
    return null;
  }

  if (!confirmToolExecution) {
    return createToolError(
      "tool_confirmation_required",
      `Tool "${tool.name}" requires confirmation before execution.`,
      {
        risk: tool.risk,
        permissions: tool.permissions,
        isReadOnly: tool.isReadOnly,
        requiresConfirmation: tool.requiresConfirmation,
      },
    );
  }

  const decision = await confirmToolExecution({
    toolName: tool.name,
    input,
    risk: tool.risk,
    permissions: tool.permissions,
    reason: getConfirmationReason(tool),
  });

  if (!decision.allowed) {
    return createToolError(
      "tool_confirmation_denied",
      decision.reason ?? `Execution of tool "${tool.name}" was denied.`,
    );
  }

  return null;
}

async function executeToolWithRetries({
  tool,
  input,
  context,
}: {
  tool: ToolDefinition;
  input: unknown;
  context: ToolExecutionContext;
}): Promise<ToolExecutionResult> {
  const retryConfig = normalizeRetryConfig(tool);

  for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
    if (context.signal.aborted) {
      return createToolError(
        "tool_aborted",
        "Tool execution was aborted before it started.",
        context.signal.reason,
        {
          attempts: attempt,
          maxAttempts: retryConfig.maxAttempts,
        },
      );
    }

    try {
      const result = await tool.execute(input as never, context);
      const resultWithMetadata = withAttemptMetadata(
        result,
        attempt,
        retryConfig.maxAttempts,
      );

      if (!canRetryResult(resultWithMetadata, retryConfig, attempt)) {
        return resultWithMetadata;
      }
    } catch (error) {
      const result = createToolError(
        context.signal.aborted ? "tool_aborted" : "tool_execution_failed",
        context.signal.aborted
          ? "Tool execution was aborted."
          : error instanceof Error
            ? error.message
            : "Unknown tool execution error.",
        context.signal.aborted ? context.signal.reason : error,
        {
          attempts: attempt,
          maxAttempts: retryConfig.maxAttempts,
        },
      );

      if (!canRetryResult(result, retryConfig, attempt)) {
        return result;
      }
    }

    try {
      await sleep(retryConfig.delayMs, context.signal);
    } catch {
      return createToolError(
        "tool_aborted",
        "Tool execution was aborted while waiting for retry.",
        context.signal.reason,
        {
          attempts: attempt,
          maxAttempts: retryConfig.maxAttempts,
        },
      );
    }
  }

  return createToolError(
    "tool_execution_failed",
    "Tool execution failed after all retry attempts.",
    undefined,
    {
      attempts: retryConfig.maxAttempts,
      maxAttempts: retryConfig.maxAttempts,
    },
  );
}

export async function executeTool({
  registry,
  toolName,
  input,
  sessionId,
  cwd,
  timeoutMs,
  signal,
  confirmToolExecution,
}: ExecuteToolInput): Promise<ToolExecutionResult> {
  const tool = registry.get(toolName);

  if (!tool) {
    return createToolError(
      "tool_not_found",
      `Tool "${toolName}" is not registered.`,
    );
  }

  const validation = tool.validateInput?.(input);

  if (validation?.ok === false) {
    return createToolError("invalid_tool_input", validation.error);
  }

  const validatedInput = validation?.ok ? validation.input : input;

  const confirmationError = await ensureToolConfirmed({
    tool,
    input: validatedInput,
    confirmToolExecution,
  });

  if (confirmationError) {
    return confirmationError;
  }

  const resolvedTimeoutMs = getExecutionTimeoutMs(tool, timeoutMs);
  const timeoutSignal = createTimeoutSignal(resolvedTimeoutMs, signal);

  const context: ToolExecutionContext = {
    sessionId,
    cwd: resolveCwd(cwd),
    signal: timeoutSignal.signal,
  };

  try {
    return await executeToolWithRetries({
      tool,
      input: validatedInput,
      context,
    });
  } finally {
    timeoutSignal.cleanup();
  }
}