import type { ListResponse } from "ollama";
import { createOllamaClient } from "./client.js";
import type { OllamaModelItem } from "./types.js";

function mapModel(response: ListResponse[ "models" ][ number ]): OllamaModelItem {
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

  return response.models.map(mapModel);
}