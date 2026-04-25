import { normalizeOllamaHost } from "./config.js";

export type OllamaConnectionResult =
  | {
    ok: true;
    host: string;
    version: string | null;
    latencyMs: number;
    checkedAt: string;
  }
  | {
    ok: false;
    host: string;
    error: string;
    latencyMs: number;
    checkedAt: string;
  };

type VersionResponse = {
  version?: unknown;
};

function getErrorMessage(error: unknown, wasAborted: boolean) {
  if (wasAborted) {
    return "Timeout verificando conexión con Ollama";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Error desconocido verificando conexión con Ollama";
}

export async function pingOllamaHost(
  host: string,
  timeoutMs = 3000,
): Promise<OllamaConnectionResult> {
  const normalizedHost = normalizeOllamaHost(host);
  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const url = new URL("/api/version", normalizedHost);

    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      return {
        ok: false,
        host: normalizedHost,
        error: `Ollama respondió HTTP ${response.status}`,
        latencyMs,
        checkedAt,
      };
    }

    const data = (await response.json()) as VersionResponse;
    const version = typeof data.version === "string" ? data.version : null;

    return {
      ok: true,
      host: normalizedHost,
      version,
      latencyMs,
      checkedAt,
    };
  } catch (error) {
    return {
      ok: false,
      host: normalizedHost,
      error: getErrorMessage(error, controller.signal.aborted),
      latencyMs: Date.now() - startedAt,
      checkedAt,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}