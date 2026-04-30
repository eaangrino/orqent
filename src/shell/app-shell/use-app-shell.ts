import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, relative, sep } from "node:path";
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadOllamaConfig, saveOllamaConfig } from "../../models/ollama/storage.js";
import {
  loadAppShellConfig,
  saveAppShellConfig,
} from "./storage.js";
import {
  DEFAULT_OLLAMA_CONFIG,
  normalizeOllamaHost,
} from "../../models/ollama/config.js";
import {
  buildPermissionPolicy,
  type PermissionMode,
} from "../../security/index.js";
import type { AppView } from "./types.js";

function resolveLaunchCwd() {
  try {
    return realpathSync(process.cwd()).normalize("NFC");
  } catch {
    return process.cwd().normalize("NFC");
  }
}

const launchCwd = resolveLaunchCwd();

function formatOllamaHostLabel(host: string) {
  try {
    const url = new URL(normalizeOllamaHost(host));
    const hostname = url.hostname.toLowerCase();

    if (hostname === "ollama.com") {
      return "Cloud";
    }

    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1"
    ) {
      return "Local";
    }

    return "Custom";
  } catch {
    return "Custom";
  }
}

function formatPathForFooter(path: string) {
  const homePath = homedir().normalize("NFC");
  const normalizedPath = path.normalize("NFC");
  const relativePath = relative(homePath, normalizedPath);

  if (!relativePath) {
    return "~";
  }

  if (!relativePath.startsWith("..") && !isAbsolute(relativePath)) {
    return `~/${relativePath.split(sep).join("/")}`;
  }

  return normalizedPath;
}

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

function formatPermissionModeLabel(mode: PermissionMode) {
  switch (mode) {
    case "ask":
      return "Ask";

    case "allow":
      return "Allow";

    case "deny":
      return "Deny";
  }
}

export function useAppShell() {
  const [ activeView, setActiveView ] = useState<AppView>("home");
  const [ isAppShellConfigHydrated, setIsAppShellConfigHydrated ] =
    useState(false);
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
  const [ permissionMode, setPermissionMode ] =
    useState<PermissionMode>("ask");
  const [ isOllamaConfigHydrated, setIsOllamaConfigHydrated ] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function hydrateAppShellConfig() {
      const config = await loadAppShellConfig();

      if (isCancelled) {
        return;
      }

      setActiveView(config.lastActiveView);
      setPermissionMode(config.permissionMode);
      setIsAppShellConfigHydrated(true);
    }

    void hydrateAppShellConfig();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAppShellConfigHydrated) {
      return;
    }

    void saveAppShellConfig({
      lastActiveView: activeView,
      permissionMode,
    });
  }, [ isAppShellConfigHydrated, activeView, permissionMode ]);

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

      case "/permissions":
      case "/permission":
        setActiveView("permissions");
        return true;

      case "/mcp":
        setActiveView("mcp");
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
    return [
      `Current Model: ${selectedModel}`,
      `Thinking Mode: ${formatThinkingModeLabel(thinkingMode)}`,
      `Permissions: ${formatPermissionModeLabel(permissionMode)}`,
    ].join(" · ");
  }, [ selectedModel, thinkingMode, permissionMode ]);

  const footerLineB = useMemo(() => {
    return `Ollama Host: ${formatOllamaHostLabel(ollamaHost)}`;
  }, [ ollamaHost ]);

  const footerLineBRightText = useMemo(() => {
    return `${formatPathForFooter(launchCwd)}`;
  }, []);

  const permissionPolicy = useMemo(
    () =>
      buildPermissionPolicy({
        mode: permissionMode,
        denyRiskAtLeast: "critical",
      }),
    [ permissionMode ],
  );

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
    permissionMode,
    setPermissionMode,
    permissionPolicy,
    isOllamaConfigHydrated,
    handleBackToHome,
    handleSelectEndpoint,
    handleSelectModel,
    handleSlashCommand,
  };
}