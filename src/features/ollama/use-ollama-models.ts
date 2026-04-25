import { useEffect, useState } from "react";
import { listOllamaModels } from "./models.js";
import type { OllamaModelItem } from "./types.js";

type UseOllamaModelsResult = {
  models: OllamaModelItem[];
  isLoading: boolean;
  error: string | null;
};

export function useOllamaModels(host: string): UseOllamaModelsResult {
  const [ models, setModels ] = useState<OllamaModelItem[]>([]);
  const [ isLoading, setIsLoading ] = useState(false);
  const [ error, setError ] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const nextModels = await listOllamaModels(host);

        if (isCancelled) {
          return;
        }

        setModels(nextModels);
      } catch (error_) {
        if (isCancelled) {
          return;
        }

        const message =
          error_ instanceof Error ? error_.message : "Error desconocido cargando modelos";

        setModels([]);
        setError(message);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      isCancelled = true;
    };
  }, [ host ]);

  return {
    models,
    isLoading,
    error,
  };
}