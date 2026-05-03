import type {
  ToolDefinition,
  ToolPermission,
  ToolRiskLevel,
} from "../tools/types.js";

export type PermissionMode = "ask" | "allow" | "deny";

export type PermissionEffect = "allow" | "ask" | "deny";

export type PermissionRule = {
  effect: PermissionEffect;
  toolName?: string;
  permission?: ToolPermission;
  minRisk?: ToolRiskLevel;
  readOnly?: boolean;
  reason?: string;
};

export type PermissionPolicy = {
  mode: PermissionMode;
  rules: PermissionRule[];
};

export type PermissionEvaluation = {
  effect: PermissionEffect;
  reason: string;
  matchedRule?: PermissionRule;
};

export type EvaluateToolPermissionInput = {
  policy: PermissionPolicy;
  tool: ToolDefinition;
};

const riskOrder: ToolRiskLevel[] = [
  "safe",
  "low",
  "medium",
  "high",
  "critical",
];

export function createDefaultPermissionPolicy(
  mode: PermissionMode = "ask",
): PermissionPolicy {
  return {
    mode,
    rules: [],
  };
}

export function compareRiskLevel(
  left: ToolRiskLevel,
  right: ToolRiskLevel,
): number {
  return riskOrder.indexOf(left) - riskOrder.indexOf(right);
}

export function isRiskAtLeast(
  actual: ToolRiskLevel,
  minimum: ToolRiskLevel,
): boolean {
  return compareRiskLevel(actual, minimum) >= 0;
}

function normalizeToolName(name: string): string {
  return name.trim().toLowerCase();
}

function ruleMatchesTool(rule: PermissionRule, tool: ToolDefinition): boolean {
  if (
    rule.toolName !== undefined &&
    normalizeToolName(rule.toolName) !== normalizeToolName(tool.name)
  ) {
    return false;
  }

  if (
    rule.permission !== undefined &&
    !tool.permissions.includes(rule.permission)
  ) {
    return false;
  }

  if (
    rule.minRisk !== undefined &&
    !isRiskAtLeast(tool.risk, rule.minRisk)
  ) {
    return false;
  }

  if (rule.readOnly !== undefined && tool.isReadOnly !== rule.readOnly) {
    return false;
  }

  return true;
}

function findMatchingRule(
  rules: PermissionRule[],
  tool: ToolDefinition,
  effect: PermissionEffect,
): PermissionRule | undefined {
  return rules.find(
    (rule) => rule.effect === effect && ruleMatchesTool(rule, tool),
  );
}

function createRuleEvaluation(
  rule: PermissionRule,
  fallbackReason: string,
): PermissionEvaluation {
  return {
    effect: rule.effect,
    reason: rule.reason ?? fallbackReason,
    matchedRule: rule,
  };
}

function evaluateAskMode(tool: ToolDefinition): PermissionEvaluation {
  if (tool.requiresConfirmation) {
    return {
      effect: "ask",
      reason: `Tool "${tool.name}" requires explicit confirmation.`,
    };
  }

  if (!tool.isReadOnly) {
    return {
      effect: "ask",
      reason: `Tool "${tool.name}" can modify external state.`,
    };
  }

  if (isRiskAtLeast(tool.risk, "medium")) {
    return {
      effect: "ask",
      reason: `Tool "${tool.name}" has ${tool.risk} risk.`,
    };
  }

  return {
    effect: "allow",
    reason: `Tool "${tool.name}" is read-only and low risk.`,
  };
}

export function evaluateToolPermission({
  policy,
  tool,
}: EvaluateToolPermissionInput): PermissionEvaluation {
  if (policy.mode === "deny") {
    return {
      effect: "deny",
      reason: "Permission mode is deny.",
    };
  }

  const denyRule = findMatchingRule(policy.rules, tool, "deny");

  if (denyRule) {
    return createRuleEvaluation(
      denyRule,
      `Tool "${tool.name}" is denied by policy rule.`,
    );
  }

  const askRule = findMatchingRule(policy.rules, tool, "ask");

  if (askRule) {
    return createRuleEvaluation(
      askRule,
      `Tool "${tool.name}" requires confirmation by policy rule.`,
    );
  }

  const allowRule = findMatchingRule(policy.rules, tool, "allow");

  if (allowRule) {
    return createRuleEvaluation(
      allowRule,
      `Tool "${tool.name}" is allowed by policy rule.`,
    );
  }

  if (policy.mode === "allow") {
    return {
      effect: "allow",
      reason: "Permission mode is allow.",
    };
  }

  return evaluateAskMode(tool);
}