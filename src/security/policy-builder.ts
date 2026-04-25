import type {
  ToolPermission,
  ToolRiskLevel,
} from "../tools/types.js";
import {
  createDefaultPermissionPolicy,
  type PermissionMode,
  type PermissionPolicy,
  type PermissionRule,
} from "./permissions.js";

export type BuildPermissionPolicyInput = {
  mode: PermissionMode;
  blockedTools?: string[];
  blockedPermissions?: ToolPermission[];
  askPermissions?: ToolPermission[];
  denyRiskAtLeast?: ToolRiskLevel;
  askRiskAtLeast?: ToolRiskLevel;
};

function toToolDenyRules(toolNames: string[] | undefined): PermissionRule[] {
  return (toolNames ?? [])
    .map((toolName) => toolName.trim().toLowerCase())
    .filter(Boolean)
    .map((toolName) => ({
      effect: "deny",
      toolName,
      reason: `Tool "${toolName}" is blocked by policy.`,
    }));
}

function toPermissionRules(
  permissions: ToolPermission[] | undefined,
  effect: "ask" | "deny",
): PermissionRule[] {
  return (permissions ?? []).map((permission) => ({
    effect,
    permission,
    reason:
      effect === "deny"
        ? `Permission "${permission}" is blocked by policy.`
        : `Permission "${permission}" requires confirmation by policy.`,
  }));
}

export function buildPermissionPolicy({
  mode,
  blockedTools,
  blockedPermissions,
  askPermissions,
  denyRiskAtLeast,
  askRiskAtLeast,
}: BuildPermissionPolicyInput): PermissionPolicy {
  const basePolicy = createDefaultPermissionPolicy(mode);

  return {
    ...basePolicy,
    rules: [
      ...toToolDenyRules(blockedTools),
      ...toPermissionRules(blockedPermissions, "deny"),
      ...(denyRiskAtLeast
        ? [
          {
            effect: "deny" as const,
            minRisk: denyRiskAtLeast,
            reason: `Tools with ${denyRiskAtLeast} risk or higher are blocked by policy.`,
          },
        ]
        : []),
      ...toPermissionRules(askPermissions, "ask"),
      ...(askRiskAtLeast
        ? [
          {
            effect: "ask" as const,
            minRisk: askRiskAtLeast,
            reason: `Tools with ${askRiskAtLeast} risk or higher require confirmation by policy.`,
          },
        ]
        : []),
    ],
  };
}