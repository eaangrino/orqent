export type AppView =
  | "home"
  | "config"
  | "model"
  | "params"
  | "thinking"
  | "permissions"
  | "mcp"
  | "skills";

export type OllamaEndpointOption = {
  label: string;
  url: string;
};