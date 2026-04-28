import type { ListResponse } from "ollama";
import { createOllamaClient } from "./client.js";
import type { OllamaModelItem } from "./types.js";

type OllamaListModel = ListResponse[ "models" ][ number ];

const embeddingModelNamePatterns = [
  /(^|[:/_-])embed(ding)?($|[:/_-])/i,
  /all-minilm/i,
  /embeddinggemma/i,
  /nomic-embed/i,
  /mxbai-embed/i,
  /bge[-_:]/i,
  /e5[-_:]/i,
  /gte[-_:]/i,
  /snowflake.*embed/i,
  /arctic-embed/i,
  /qwen.*embedding/i,
];

const embeddingModelFamilies = new Set([
  "bert",
]);

export function isEmbeddingModel(response: OllamaListModel): boolean {
  const searchableName = `${response.name} ${response.model}`;

  if (embeddingModelNamePatterns.some((pattern) => pattern.test(searchableName))) {
    return true;
  }

  const family = response.details.family?.trim().toLowerCase();

  if (family && embeddingModelFamilies.has(family)) {
    return true;
  }

  return false;
}

function mapModel(response: OllamaListModel): OllamaModelItem {
  return {
    name: response.name,
    model: response.model,
    size: response.size,
    family: response.details.family ?? null,
    parameterSize: response.details.parameter_size ?? null,
    quantizationLevel: response.details.quantization_level ?? null,
    modifiedAt: response.modified_at
      ? new Date(response.modified_at).toISOString()
      : null,
  };
}

export async function listOllamaModels(host: string): Promise<OllamaModelItem[]> {
  const client = createOllamaClient(host);
  const response = await client.list();

  return response.models
    .filter((model) => !isEmbeddingModel(model))
    .map(mapModel);
}