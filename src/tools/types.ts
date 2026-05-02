export type ToolRiskLevel = "safe" | "low" | "medium" | "high" | "critical";

export type ToolPermission =
  | "filesystem:read"
  | "filesystem:write"
  | "shell:execute"
  | "project:search"
  | "agents:read"
  | "agents:write"
  | "mcp:read"
  | "mcp:write"
  | "skills:read"
  | "skills:write";

export type ToolJsonSchema = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type ToolRuntimeContext = {
  ollamaHost?: string;
  activeModel?: string | null;
  generationOptions?: unknown;
  thinkingMode?: unknown;
};

export type ToolExecutionContext = {
  sessionId: string;
  cwd: string;
  signal: AbortSignal;
  runtime?: ToolRuntimeContext;
};

export type ToolExecutionProfile = {
  risk?: ToolRiskLevel;
  permissions?: ToolPermission[];
  requiresConfirmation?: boolean;
  isReadOnly?: boolean;
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

export type ToolActionStatus =
  | "tool_not_found"
  | "invalid_input"
  | "permission_denied"
  | "confirmation_required"
  | "confirmation_denied"
  | "executed";

export type ToolConfirmationOutcome =
  | "not_required"
  | "missing"
  | "allowed"
  | "denied";

export type ToolActionLogEntry = {
  sessionId: string;
  toolName: string;
  cwd: string;
  input: unknown;
  status: ToolActionStatus;
  ok: boolean;
  durationMs: number;
  risk?: ToolRiskLevel;
  permissions?: ToolPermission[];
  requiresConfirmation?: boolean;
  isReadOnly?: boolean;
  permissionEffect?: "allow" | "ask" | "deny";
  permissionReason?: string;
  confirmation?: ToolConfirmationOutcome;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
};

export type ToolActionLogger = (
  entry: ToolActionLogEntry,
) => void | Promise<void>;

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
  getExecutionProfile?: (input: TInput) => ToolExecutionProfile;

  execute: (
    input: TInput,
    context: ToolExecutionContext,
  ) => Promise<ToolExecutionResult<TResult>>;
};