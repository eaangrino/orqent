export type OllamaConfig = {
  host: string;
  selectedModel: string | null;
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