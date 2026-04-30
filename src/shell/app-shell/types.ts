export type AppView =
  | "home"
  | "config"
  | "model"
  | "params"
  | "thinking"
  | "permissions"
  | "mcp";

export type OllamaEndpointOption = {
  label: string;
  url: string;
};