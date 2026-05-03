export type OllamaThinkingMode =
  | "default"
  | "disabled"
  | "enabled"
  | "low"
  | "medium"
  | "high";

export type OllamaGenerationOptions = {
  temperature: number;
  topP: number;
  topK: number;
  numCtx: number;
  numPredict: number;
  repeatPenalty: number;
};

export type OllamaConfig = {
  host: string;
  selectedModel: string | null;
  generationOptions: OllamaGenerationOptions;
  thinkingMode: OllamaThinkingMode;
};

export type OllamaModelItem = {
  name: string;
  model: string;
  size: number;
  family: string | null;
  parameterSize: string | null;
  quantizationLevel: string | null;
  modifiedAt: string | null;
};