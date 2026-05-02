export type SkillScope = "global" | "project";

export type SkillActivationConfig = {
  manual: boolean;
  auto: boolean;
  keywords: string[];
  filePatterns: string[];
  toolNames: string[];
};

export type SkillDefinitionInput = {
  identifier: string;
  name: string;
  description: string;
  instructions: string;
  enabled?: boolean;
  scope?: SkillScope;
  activation?: Partial<SkillActivationConfig>;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
};

export type SkillDefinition = {
  identifier: string;
  name: string;
  description: string;
  instructions: string;
  enabled: boolean;
  scope: SkillScope;
  activation: SkillActivationConfig;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
};

export type SkillDefinitionsFile = {
  skills: SkillDefinition[];
};