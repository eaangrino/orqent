import { realpathSync } from "node:fs";
import { ToolRegistry } from "./registry.js";
import {
  createDefaultPermissionPolicy,
  evaluateToolPermission,
  type PermissionEffect,
  type PermissionPolicy,
} from "../security/index.js";
import type {
  ToolActionLogger,
  ToolConfirmationHandler,
  ToolConfirmationOutcome,
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolRetryConfig,
  ToolRuntimeContext,
} from "./types.js";

export type ExecuteToolInput = {
  registry: ToolRegistry;
  toolName: string;
  input: unknown;
  sessionId: string;
  cwd?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  runtime?: ToolRuntimeContext;
  permissionPolicy?: PermissionPolicy;
  confirmToolExecution?: ToolConfirmationHandler;
  toolActionLogger?: ToolActionLogger;
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

type ToolPermissionDecision = {
  error: ToolExecutionResult | null;
  effect: PermissionEffect;
  reason: string;
  confirmation: ToolConfirmationOutcome;
};

const REDACTED_SECRET_VALUE = "[redacted secret]";

const sensitiveKeyPatterns = [
  /authorization/i,
  /api[-_]?key/i,
  /access[-_]?token/i,
  /refresh[-_]?token/i,
  /token/i,
  /secret/i,
  /password/i,
  /passwd/i,
  /pwd/i,
  /credential/i,
  /database[-_]?uri/i,
  /database[-_]?url/i,
  /db[-_]?uri/i,
  /db[-_]?url/i,
  /connection[-_]?string/i,
  /postgres.*uri/i,
  /postgres.*url/i,
  /x-database-uri/i,
];

function isSensitiveKey(key: string): boolean {
  return sensitiveKeyPatterns.some((pattern) => pattern.test(key));
}

function redactStringBytes(value: string): string {
  return `[redacted ${Buffer.byteLength(value, "utf8")} bytes]`;
}

function sanitizeToolInputValue(value: unknown, key = ""): unknown {
  if (typeof value === "string") {
    if (key === "content" || key === "stdin") {
      return redactStringBytes(value);
    }

    if (isSensitiveKey(key)) {
      return REDACTED_SECRET_VALUE;
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeToolInputValue(item, key));
  }

  if (
    typeof value !== "object" ||
    value === null
  ) {
    return value;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [ childKey, childValue ] of Object.entries(value)) {
    if (isSensitiveKey(childKey)) {
      sanitized[ childKey ] = REDACTED_SECRET_VALUE;
      continue;
    }

    sanitized[ childKey ] = sanitizeToolInputValue(childValue, childKey);
  }

  return sanitized;
}

function sanitizeToolInput(input: unknown): unknown {
  return sanitizeToolInputValue(input);
}

function getResultError(result: ToolExecutionResult): {
  errorCode?: string;
  errorMessage?: string;
} {
  if (result.ok) {
    return {};
  }

  return {
    errorCode: result.error.code,
    errorMessage: result.error.message,
  };
}

async function logToolAction({
  logger,
  sessionId,
  tool,
  toolName,
  cwd,
  input,
  result,
  startedAt,
  status,
  permissionEffect,
  permissionReason,
  confirmation,
}: {
  logger: ToolActionLogger | undefined;
  sessionId: string;
  tool?: ToolDefinition;
  toolName: string;
  cwd: string;
  input: unknown;
  result: ToolExecutionResult;
  startedAt: number;
  status: Parameters<ToolActionLogger>[ 0 ][ "status" ];
  permissionEffect?: PermissionEffect;
  permissionReason?: string;
  confirmation?: ToolConfirmationOutcome;
}): Promise<void> {
  if (!logger) {
    return;
  }

  const error = getResultError(result);

  try {
    await logger({
      sessionId,
      toolName,
      cwd,
      input: sanitizeToolInput(input),
      status,
      ok: result.ok,
      durationMs: Date.now() - startedAt,
      risk: tool?.risk,
      permissions: tool?.permissions,
      requiresConfirmation: tool?.requiresConfirmation,
      isReadOnly: tool?.isReadOnly,
      permissionEffect,
      permissionReason,
      confirmation,
      ...error,
      metadata: result.metadata,
    });
  } catch {
    // Audit logging must never break tool execution.
  }
}

function applyExecutionProfile(
  tool: ToolDefinition,
  input: unknown,
): ToolDefinition {
  const profile = tool.getExecutionProfile?.(input as never);

  if (!profile) {
    return tool;
  }

  return {
    ...tool,
    risk: profile.risk ?? tool.risk,
    permissions: profile.permissions ?? tool.permissions,
    requiresConfirmation:
      profile.requiresConfirmation ?? tool.requiresConfirmation,
    isReadOnly: profile.isReadOnly ?? tool.isReadOnly,
  };
}

async function ensureToolPermitted({
  tool,
  input,
  permissionPolicy,
  confirmToolExecution,
}: {
  tool: ToolDefinition;
  input: unknown;
  permissionPolicy: PermissionPolicy | undefined;
  confirmToolExecution: ToolConfirmationHandler | undefined;
}): Promise<ToolPermissionDecision> {
  const evaluation = evaluateToolPermission({
    policy: permissionPolicy ?? createDefaultPermissionPolicy("ask"),
    tool,
  });

  if (evaluation.effect === "allow") {
    return {
      error: null,
      effect: evaluation.effect,
      reason: evaluation.reason,
      confirmation: "not_required",
    };
  }

  if (evaluation.effect === "deny") {
    return {
      error: createToolError(
        "tool_permission_denied",
        evaluation.reason,
        {
          risk: tool.risk,
          permissions: tool.permissions,
          isReadOnly: tool.isReadOnly,
          requiresConfirmation: tool.requiresConfirmation,
          matchedRule: evaluation.matchedRule ?? null,
        },
      ),
      effect: evaluation.effect,
      reason: evaluation.reason,
      confirmation: "not_required",
    };
  }

  if (!confirmToolExecution) {
    return {
      error: createToolError(
        "tool_confirmation_required",
        evaluation.reason,
        {
          risk: tool.risk,
          permissions: tool.permissions,
          isReadOnly: tool.isReadOnly,
          requiresConfirmation: tool.requiresConfirmation,
          matchedRule: evaluation.matchedRule ?? null,
        },
      ),
      effect: evaluation.effect,
      reason: evaluation.reason,
      confirmation: "missing",
    };
  }

  const decision = await confirmToolExecution({
    toolName: tool.name,
    input,
    risk: tool.risk,
    permissions: tool.permissions,
    reason: evaluation.reason,
  });

  if (!decision.allowed) {
    return {
      error: createToolError(
        "tool_confirmation_denied",
        decision.reason ?? `Execution of tool "${tool.name}" was denied.`,
      ),
      effect: evaluation.effect,
      reason: evaluation.reason,
      confirmation: "denied",
    };
  }

  return {
    error: null,
    effect: evaluation.effect,
    reason: evaluation.reason,
    confirmation: "allowed",
  };
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
  runtime,
  permissionPolicy,
  confirmToolExecution,
  toolActionLogger,
}: ExecuteToolInput): Promise<ToolExecutionResult> {
  const startedAt = Date.now();
  const resolvedCwd = resolveCwd(cwd);
  const tool = registry.get(toolName);

  if (!tool) {
    const result = createToolError(
      "tool_not_found",
      `Tool "${toolName}" is not registered.`,
    );

    await logToolAction({
      logger: toolActionLogger,
      sessionId,
      toolName,
      cwd: resolvedCwd,
      input,
      result,
      startedAt,
      status: "tool_not_found",
    });

    return result;
  }

  const validation = tool.validateInput?.(input);

  if (validation?.ok === false) {
    const result = createToolError("invalid_tool_input", validation.error);

    await logToolAction({
      logger: toolActionLogger,
      sessionId,
      tool,
      toolName: tool.name,
      cwd: resolvedCwd,
      input,
      result,
      startedAt,
      status: "invalid_input",
    });

    return result;
  }

  const validatedInput = validation?.ok ? validation.input : input;
  const effectiveTool = applyExecutionProfile(tool, validatedInput);

  const permissionDecision = await ensureToolPermitted({
    tool: effectiveTool,
    input: validatedInput,
    permissionPolicy,
    confirmToolExecution,
  });

  if (permissionDecision.error) {
    const status =
      permissionDecision.error.ok
        ? "executed"
        : permissionDecision.error.error.code === "tool_permission_denied"
          ? "permission_denied"
          : permissionDecision.error.error.code === "tool_confirmation_required"
            ? "confirmation_required"
            : "confirmation_denied";

    await logToolAction({
      logger: toolActionLogger,
      sessionId,
      tool: effectiveTool,
      toolName: effectiveTool.name,
      cwd: resolvedCwd,
      input: validatedInput,
      result: permissionDecision.error,
      startedAt,
      status,
      permissionEffect: permissionDecision.effect,
      permissionReason: permissionDecision.reason,
      confirmation: permissionDecision.confirmation,
    });

    return permissionDecision.error;
  }

  const resolvedTimeoutMs = getExecutionTimeoutMs(tool, timeoutMs);
  const timeoutSignal = createTimeoutSignal(resolvedTimeoutMs, signal);

  const context: ToolExecutionContext = {
    sessionId,
    cwd: resolvedCwd,
    signal: timeoutSignal.signal,
    runtime,
  };

  try {
    const result = await executeToolWithRetries({
      tool: effectiveTool,
      input: validatedInput,
      context,
    });

    await logToolAction({
      logger: toolActionLogger,
      sessionId,
      tool: effectiveTool,
      toolName: effectiveTool.name,
      cwd: resolvedCwd,
      input: validatedInput,
      result,
      startedAt,
      status: "executed",
      permissionEffect: permissionDecision.effect,
      permissionReason: permissionDecision.reason,
      confirmation: permissionDecision.confirmation,
    });

    return result;
  } finally {
    timeoutSignal.cleanup();
  }
}