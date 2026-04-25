import { useCallback, useEffect, useState } from "react";
import {
  pingOllamaHost,
  type OllamaConnectionResult,
} from "./connection.js";

export type OllamaConnectionStatus = "checking" | "online" | "offline";

type UseOllamaConnectionResult = {
  status: OllamaConnectionStatus;
  result: OllamaConnectionResult | null;
  isChecking: boolean;
  checkConnection: () => Promise<void>;
};

export function useOllamaConnection(
  host: string,
): UseOllamaConnectionResult {
  const [ result, setResult ] = useState<OllamaConnectionResult | null>(null);
  const [ isChecking, setIsChecking ] = useState(false);

  const checkConnection = useCallback(async () => {
    setIsChecking(true);

    try {
      const nextResult = await pingOllamaHost(host);
      setResult(nextResult);
    } finally {
      setIsChecking(false);
    }
  }, [ host ]);

  useEffect(() => {
    let isCancelled = false;

    async function runCheck() {
      setIsChecking(true);

      try {
        const nextResult = await pingOllamaHost(host);

        if (!isCancelled) {
          setResult(nextResult);
        }
      } finally {
        if (!isCancelled) {
          setIsChecking(false);
        }
      }
    }

    void runCheck();

    return () => {
      isCancelled = true;
    };
  }, [ host ]);

  const status: OllamaConnectionStatus = isChecking
    ? "checking"
    : result?.ok
      ? "online"
      : "offline";

  return {
    status,
    result,
    isChecking,
    checkConnection,
  };
}