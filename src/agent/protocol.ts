export type JsonSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
};

export type ResponseFunctionTool = {
  type: "function";
  name: string;
  description: string;
  parameters: JsonSchema;
  strict: boolean;
};

export type ResponseFunctionCall = {
  type: "function_call";
  id?: string;
  call_id: string;
  name: string;
  arguments: string;
  status?: string;
};

export type ResponseFunctionCallOutput = {
  type: "function_call_output";
  call_id: string;
  output: string;
};

export type ResponseMessageInput = {
  role: "user" | "assistant" | "system" | "developer";
  content: string;
};

export type ResponseInputItem =
  | ResponseMessageInput
  | ResponseFunctionCall
  | ResponseFunctionCallOutput
  | Record<string, unknown>;

export type OpenAIResponseLike = {
  id?: string;
  output_text?: string;
  output: Array<Record<string, unknown>>;
  _request_id?: string | null;
};

export type ResponsesCreateParams = {
  model: string;
  instructions: string;
  input: ResponseInputItem[];
  tools: ResponseFunctionTool[];
  temperature?: number;
  top_p?: number;
  max_output_tokens?: number;
};

export type ResponsesClient = {
  responses: {
    create(params: ResponsesCreateParams): Promise<OpenAIResponseLike>;
  };
  toInputItems(output: Array<Record<string, unknown>>): ResponseInputItem[];
};

export function isFunctionCall(
  item: Record<string, unknown>,
): item is ResponseFunctionCall {
  return (
    item.type === "function_call" &&
    typeof item.call_id === "string" &&
    typeof item.name === "string" &&
    typeof item.arguments === "string"
  );
}
