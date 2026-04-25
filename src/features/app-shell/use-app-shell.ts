import { realpathSync } from "node:fs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadOllamaConfig, saveOllamaConfig } from "../ollama/storage.js";
import {
  DEFAULT_OLLAMA_CONFIG,
  normalizeOllamaHost,
} from "../ollama/config.js";
import type { AppView } from "./types.js";

function resolveLaunchCwd() {
  try {
    return realpathSync(process.cwd()).normalize("NFC");
  } catch {
    return process.cwd().normalize("NFC");
  }
}

const launchCwd = resolveLaunchCwd();

export function useAppShell() {
  const [ activeView, setActiveView ] = useState<AppView>("home");
  const [ selectedModel, setSelectedModel ] = useState(
    DEFAULT_OLLAMA_CONFIG.selectedModel ?? "gemma4:e4b",
  );
  const [ ollamaHost, setOllamaHost ] = useState(DEFAULT_OLLAMA_CONFIG.host);
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
    });
  }, [ isOllamaConfigHydrated, ollamaHost, selectedModel ]);

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

      case "/home":
      case "/clear":
        setActiveView("home");
        return true;

      default:
        return false;
    }
  }, []);

  const footerLineA = useMemo(() => {
    return `Modelo Actual: ${selectedModel}`;
  }, [ selectedModel ]);

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
    isOllamaConfigHydrated,
    handleBackToHome,
    handleSelectEndpoint,
    handleSelectModel,
    handleSlashCommand,
  };
}