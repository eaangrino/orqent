export type AppView =
  | "home"
  | "config"
  | "model"
  | "params"
  | "thinking"
  | "permissions";

export type OllamaEndpointOption = {
  label: string;
  url: string;
};