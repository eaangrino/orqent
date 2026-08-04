import OpenAI from "openai";
import { toResponseInputItems } from "openai/lib/responses/ResponseInputItems";
import type { AppConfig } from "../config.js";
import type {
  OpenAIResponseLike,
  ResponseInputItem,
  ResponsesClient,
  ResponsesCreateParams,
} from "../agent/protocol.js";

export function createOpenAIClient(config: AppConfig): ResponsesClient {
  const client = new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    timeout: config.requestTimeoutMs,
    maxRetries: 2,
  });

  return {
    responses: {
      async create(params: ResponsesCreateParams): Promise<OpenAIResponseLike> {
        const response = await client.responses.create(
          params as Parameters<typeof client.responses.create>[0],
        );
        return response as unknown as OpenAIResponseLike;
      },
    },
    toInputItems(output): ResponseInputItem[] {
      return toResponseInputItems(
        output as Parameters<typeof toResponseInputItems>[0],
      ) as unknown as ResponseInputItem[];
    },
  };
}
