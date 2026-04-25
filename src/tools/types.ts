export type ToolRiskLevel = "safe" | "low" | "medium" | "high" | "critical";

export type ToolPermission =
  | "filesystem:read"
  | "filesystem:write"
  | "shell:execute"
  | "project:search";

export type ToolJsonSchema = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type ToolExecutionContext = {
  sessionId: string;
  cwd: string;
  signal: AbortSignal;
};

export type ToolRetryConfig = {
  maxAttempts: number;
  delayMs: number;
  retryableErrorCodes?: string[];
};

export type ToolConfirmationRequest = {
  toolName: string;
  input: unknown;
  risk: ToolRiskLevel;
  permissions: ToolPermission[];
  reason: string;
};

export type ToolConfirmationDecision =
  | {
    allowed: true;
  }
  | {
    allowed: false;
    reason?: string;
  };

export type ToolConfirmationHandler = (
  request: ToolConfirmationRequest,
) => Promise<ToolConfirmationDecision>;

export type ToolValidationResult<TInput> =
  | {
    ok: true;
    input: TInput;
  }
  | {
    ok: false;
    error: string;
  };

export type ToolExecutionOk<TResult = unknown> = {
  ok: true;
  result: TResult;
  metadata?: Record<string, unknown>;
};

export type ToolExecutionError = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: Record<string, unknown>;
};

export type ToolExecutionResult<TResult = unknown> =
  | ToolExecutionOk<TResult>
  | ToolExecutionError;

export type AnyToolDefinition = ToolDefinition<any, any>;

export type ToolDefinition<TInput = Record<string, unknown>, TResult = unknown> = {
  name: string;
  description: string;
  inputSchema: ToolJsonSchema;

  risk: ToolRiskLevel;
  permissions: ToolPermission[];
  requiresConfirmation: boolean;
  isReadOnly: boolean;

  timeoutMs?: number;
  retry?: ToolRetryConfig;

  validateInput?: (input: unknown) => ToolValidationResult<TInput>;

  execute: (
    input: TInput,
    context: ToolExecutionContext,
  ) => Promise<ToolExecutionResult<TResult>>;
};