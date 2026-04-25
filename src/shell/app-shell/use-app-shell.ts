import { realpathSync } from "node:fs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadOllamaConfig, saveOllamaConfig } from "../../models/ollama/storage.js";
import {
  DEFAULT_OLLAMA_CONFIG,
  normalizeOllamaHost,
} from "../../models/ollama/config.js";
import type { AppView } from "./types.js";

function resolveLaunchCwd() {
  try {
    return realpathSync(process.cwd()).normalize("NFC");
  } catch {
    return process.cwd().normalize("NFC");
  }
}

const launchCwd = resolveLaunchCwd();

function formatThinkingModeLabel(mode: string) {
  switch (mode) {
    case "disabled":
      return "Disabled";

    case "enabled":
      return "Enabled";

    case "low":
      return "Low";

    case "medium":
      return "Medium";

    case "high":
      return "High";

    case "default":
    default:
      return "Default";
  }
}

export function useAppShell() {
  const [ activeView, setActiveView ] = useState<AppView>("home");
  const [ selectedModel, setSelectedModel ] = useState(
    DEFAULT_OLLAMA_CONFIG.selectedModel ?? "gemma4:e4b",
  );
  const [ ollamaHost, setOllamaHost ] = useState(DEFAULT_OLLAMA_CONFIG.host);
  const [ generationOptions, setGenerationOptions ] = useState(
    DEFAULT_OLLAMA_CONFIG.generationOptions,
  );
  const [ thinkingMode, setThinkingMode ] = useState(
    DEFAULT_OLLAMA_CONFIG.thinkingMode,
  );
  const [ isOllamaConfigHydrated, setIsOllamaConfigHydrated ] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function hydrateOllamaConfig() {
      const config = await loadOllamaConfig();

      if (isCancelled) {
        return;
      }

      setOllamaHost(normalizeOllamaHost(config.host));
      setSelectedModel(
        config.selectedModel ?? DEFAULT_OLLAMA_CONFIG.selectedModel ?? "gemma4:e4b",
      );
      setGenerationOptions(config.generationOptions);
      setThinkingMode(config.thinkingMode);
      setIsOllamaConfigHydrated(true);
    }

    void hydrateOllamaConfig();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isOllamaConfigHydrated) {
      return;
    }

    void saveOllamaConfig({
      host: ollamaHost,
      selectedModel,
      generationOptions,
      thinkingMode,
    });
  }, [ isOllamaConfigHydrated, ollamaHost, selectedModel, generationOptions, thinkingMode ]);

  const handleBackToHome = useCallback(() => {
    setActiveView("home");
  }, []);

  const handleSelectModel = useCallback((model: string) => {
    setSelectedModel(model);
    setActiveView("home");
  }, []);

  const handleSelectEndpoint = useCallback((url: string) => {
    setOllamaHost(normalizeOllamaHost(url));
    setActiveView("home");
  }, []);

  const handleSlashCommand = useCallback((command: string) => {
    switch (command.trim().toLowerCase()) {
      case "/config":
        setActiveView("config");
        return true;

      case "/model":
        setActiveView("model");
        return true;

      case "/params":
      case "/parameters":
        setActiveView("params");
        return true;

      case "/thinking":
      case "/reasoning":
        setActiveView("thinking");
        return true;

      case "/home":
      case "/clear":
        setActiveView("home");
        return true;

      default:
        return false;
    }
  }, []);

  const footerLineA = useMemo(() => {
    return `Current Model: ${selectedModel} · Thinking Mode: ${formatThinkingModeLabel(thinkingMode)}`;
  }, [ selectedModel, thinkingMode ]);

  const footerLineB = useMemo(() => {
    return `Ollama Host: ${ollamaHost}`;
  }, [ ollamaHost ]);

  const footerLineBRightText = useMemo(() => {
    return `Ruta: ${launchCwd}`;
  }, []);

  return {
    activeView,
    footerLineA,
    footerLineB,
    footerLineBRightText,
    ollamaHost,
    selectedModel,
    generationOptions,
    setGenerationOptions,
    thinkingMode,
    setThinkingMode,
    isOllamaConfigHydrated,
    handleBackToHome,
    handleSelectEndpoint,
    handleSelectModel,
    handleSlashCommand,
  };
}