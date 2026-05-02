import {
  deleteSkillDefinition,
  listSkillDefinitions,
  upsertSkillDefinition,
  type SkillActivationConfig,
  type SkillDefinition,
  type SkillDefinitionInput,
  type SkillScope,
} from "../../extensibility/skills/index.js";
import type {
  ToolDefinition,
  ToolExecutionResult,
  ToolValidationResult,
} from "../types.js";

export type SkillListInput = {
  includeDisabled?: boolean;
};

export type SkillCatalogResultItem = {
  identifier: string;
  name: string;
  description: string;
  enabled: boolean;
  scope: SkillScope;
  activation: SkillActivationConfig;
  createdAt: string;
  updatedAt: string;
};

export type SkillListResult = {
  count: number;
  skills: SkillCatalogResultItem[];
};

export type SkillUpsertInput = SkillDefinitionInput;

export type SkillUpsertResult = {
  skill: SkillCatalogResultItem;
  instructionsStored: true;
};

export type SkillDeleteInput = {
  identifier: string;
};

export type SkillDeleteResult = {
  identifier: string;
  deleted: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeScope(value: unknown): SkillScope | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === "global" || value === "project") {
    return value;
  }

  return undefined;
}

function normalizeActivation(
  value: unknown,
): Partial<SkillActivationConfig> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    return {};
  }

  return {
    manual: normalizeOptionalBoolean(value.manual),
    auto: normalizeOptionalBoolean(value.auto),
    keywords: normalizeStringArray(value.keywords),
    filePatterns: normalizeStringArray(value.filePatterns),
    toolNames: normalizeStringArray(value.toolNames),
  };
}

function toCatalogItem(skill: SkillDefinition): SkillCatalogResultItem {
  return {
    identifier: skill.identifier,
    name: skill.name,
    description: skill.description,
    enabled: skill.enabled,
    scope: skill.scope,
    activation: {
      manual: skill.activation.manual,
      auto: skill.activation.auto,
      keywords: [ ...skill.activation.keywords ],
      filePatterns: [ ...skill.activation.filePatterns ],
      toolNames: [ ...skill.activation.toolNames ],
    },
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
  };
}

function validateSkillListInput(input: unknown): ToolValidationResult<SkillListInput> {
  if (input === undefined) {
    return {
      ok: true,
      input: {},
    };
  }

  if (!isRecord(input)) {
    return {
      ok: false,
      error: "input must be an object.",
    };
  }

  return {
    ok: true,
    input: {
      includeDisabled: normalizeOptionalBoolean(input.includeDisabled),
    },
  };
}

function validateSkillUpsertInput(
  input: unknown,
): ToolValidationResult<SkillUpsertInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "input must be an object.",
    };
  }

  const identifier = normalizeString(input.identifier);
  const name = normalizeString(input.name);
  const description = normalizeString(input.description);
  const instructions = normalizeString(input.instructions);
  const scope = normalizeScope(input.scope);

  if (!identifier) {
    return {
      ok: false,
      error: "identifier is required.",
    };
  }

  if (!name) {
    return {
      ok: false,
      error: "name is required.",
    };
  }

  if (!description) {
    return {
      ok: false,
      error: "description is required.",
    };
  }

  if (!instructions) {
    return {
      ok: false,
      error: "instructions is required.",
    };
  }

  if (input.scope !== undefined && !scope) {
    return {
      ok: false,
      error: "scope must be global or project.",
    };
  }

  return {
    ok: true,
    input: {
      identifier,
      name,
      description,
      instructions,
      enabled: normalizeOptionalBoolean(input.enabled),
      scope,
      activation: normalizeActivation(input.activation),
      metadata: isRecord(input.metadata) ? input.metadata : undefined,
    },
  };
}

function validateSkillDeleteInput(
  input: unknown,
): ToolValidationResult<SkillDeleteInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: "input must be an object.",
    };
  }

  const identifier = normalizeString(input.identifier);

  if (!identifier) {
    return {
      ok: false,
      error: "identifier is required.",
    };
  }

  return {
    ok: true,
    input: {
      identifier,
    },
  };
}

export function createSkillListTool(): ToolDefinition<SkillListInput, SkillListResult> {
  return {
    name: "skill.list",
    description:
      "List declarative skills configured in local Orqent storage. Does not expose full skill instructions.",
    inputSchema: {
      type: "object",
      properties: {
        includeDisabled: {
          type: "boolean",
          description:
            "When true, include disabled skills. Defaults to false.",
        },
      },
      additionalProperties: false,
    },
    risk: "safe",
    permissions: [ "skills:read" ],
    requiresConfirmation: false,
    isReadOnly: true,
    validateInput: validateSkillListInput,
    async execute(input): Promise<ToolExecutionResult<SkillListResult>> {
      const skills = await listSkillDefinitions();
      const visibleSkills = input.includeDisabled
        ? skills
        : skills.filter((skill) => skill.enabled);

      return {
        ok: true,
        result: {
          count: visibleSkills.length,
          skills: visibleSkills.map(toCatalogItem),
        },
      };
    },
  };
}

export function createSkillUpsertTool(): ToolDefinition<SkillUpsertInput, SkillUpsertResult> {
  return {
    name: "skill.upsert",
    description:
      "Create or update a declarative skill in local Orqent storage. This changes future model behavior when the skill is activated.",
    inputSchema: {
      type: "object",
      properties: {
        identifier: {
          type: "string",
          description:
            "Stable skill identifier. Use letters, numbers, '.', '_' or '-'.",
        },
        name: {
          type: "string",
          description: "Human-readable skill name.",
        },
        description: {
          type: "string",
          description: "Short safe description of what the skill does.",
        },
        instructions: {
          type: "string",
          description:
            "Full instructions injected when the skill is active.",
        },
        enabled: {
          type: "boolean",
          description: "Whether the skill is enabled.",
        },
        scope: {
          type: "string",
          description: "Skill scope: global or project.",
        },
        activation: {
          type: "object",
          description:
            "Activation config: manual, auto, keywords, filePatterns and toolNames.",
        },
        metadata: {
          type: "object",
          description: "Optional private metadata.",
        },
      },
      required: [ "identifier", "name", "description", "instructions" ],
      additionalProperties: false,
    },
    risk: "high",
    permissions: [ "skills:write" ],
    requiresConfirmation: true,
    isReadOnly: false,
    validateInput: validateSkillUpsertInput,
    async execute(input): Promise<ToolExecutionResult<SkillUpsertResult>> {
      const skill = await upsertSkillDefinition(input);

      return {
        ok: true,
        result: {
          skill: toCatalogItem(skill),
          instructionsStored: true,
        },
      };
    },
  };
}

export function createSkillDeleteTool(): ToolDefinition<SkillDeleteInput, SkillDeleteResult> {
  return {
    name: "skill.delete",
    description:
      "Delete a declarative skill from local Orqent storage.",
    inputSchema: {
      type: "object",
      properties: {
        identifier: {
          type: "string",
          description: "Skill identifier to delete.",
        },
      },
      required: [ "identifier" ],
      additionalProperties: false,
    },
    risk: "high",
    permissions: [ "skills:write" ],
    requiresConfirmation: true,
    isReadOnly: false,
    validateInput: validateSkillDeleteInput,
    async execute(input): Promise<ToolExecutionResult<SkillDeleteResult>> {
      const deleted = await deleteSkillDefinition(input.identifier);

      return {
        ok: true,
        result: {
          identifier: input.identifier.trim().toLowerCase(),
          deleted,
        },
      };
    },
  };
}

export const skillListTool = createSkillListTool();
export const skillUpsertTool = createSkillUpsertTool();
export const skillDeleteTool = createSkillDeleteTool();
