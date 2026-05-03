import { describe, expect, it } from "vitest";
import {
  TOOL_CALL_TAG_NAME,
  parseModelToolCall,
} from "../tool-call-protocol.js";

function wrapToolCall(json: string) {
  return `<${TOOL_CALL_TAG_NAME}>
${json}
</${TOOL_CALL_TAG_NAME}>`;
}

describe("tool-call-protocol", () => {
  it("devuelve none cuando no hay tool call", () => {
    const result = parseModelToolCall("Respuesta normal sin tools.");

    expect(result).toEqual({
      kind: "none",
    });
  });

  it("parsea un tool call válido", () => {
    const result = parseModelToolCall(
      wrapToolCall(`{
  "toolName": "filesystem.list",
  "input": {
    "path": "."
  },
  "reason": "Need to inspect project files."
}`),
    );

    expect(result.kind).toBe("tool_call");

    if (result.kind === "tool_call") {
      expect(result.toolCall).toEqual({
        toolName: "filesystem.list",
        input: {
          path: ".",
        },
        reason: "Need to inspect project files.",
      });
      expect(result.rawBlock).toContain(TOOL_CALL_TAG_NAME);
      expect(result.rawJson).toContain("filesystem.list");
    }
  });

  it("rechaza tool call con texto fuera del bloque", () => {
    const result = parseModelToolCall(
      `Voy a usar una tool.\n${wrapToolCall(`{
  "toolName": "filesystem.list",
  "input": {}
}`)}`,
    );

    expect(result.kind).toBe("invalid");

    if (result.kind === "invalid") {
      expect(result.error).toBe(
        "Tool call block must be the only content in the model response.",
      );
    }
  });

  it("rechaza múltiples tool calls en una respuesta", () => {
    const result = parseModelToolCall(
      `${wrapToolCall(`{
  "toolName": "filesystem.list",
  "input": {}
}`)}

${wrapToolCall(`{
  "toolName": "project.search",
  "input": {
    "query": "orqent"
  }
}`)}`,
    );

    expect(result.kind).toBe("invalid");

    if (result.kind === "invalid") {
      expect(result.error).toBe(
        "Model response contains more than one tool call block.",
      );
    }
  });

  it("rechaza JSON inválido", () => {
    const result = parseModelToolCall(
      wrapToolCall(`{
  "toolName": "filesystem.list",
  "input": 
}`),
    );

    expect(result.kind).toBe("invalid");

    if (result.kind === "invalid") {
      expect(result.error).toContain("Invalid tool call JSON:");
    }
  });

  it("rechaza toolName vacío", () => {
    const result = parseModelToolCall(
      wrapToolCall(`{
  "toolName": "",
  "input": {}
}`),
    );

    expect(result.kind).toBe("invalid");

    if (result.kind === "invalid") {
      expect(result.error).toBe(
        "Tool call requires a non-empty toolName string.",
      );
    }
  });

  it("rechaza input que no sea objeto", () => {
    const result = parseModelToolCall(
      wrapToolCall(`{
  "toolName": "filesystem.list",
  "input": []
}`),
    );

    expect(result.kind).toBe("invalid");

    if (result.kind === "invalid") {
      expect(result.error).toBe("Tool call input must be a JSON object.");
    }
  });
});
