import { useEffect, useEffectEvent, useState } from "react";
import { toAppError } from "@/lib/tauri";

// Consumers remount when their commit or file changes.
export function useGraphRequest<T>(request: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const start = useEffectEvent(request);

  useEffect(() => {
    let current = true;
    start().then((value) => { if (current) setData(value); }).catch((reason) => {
      if (current) setError(toAppError(reason).message);
    });
    return () => { current = false; };
  }, [attempt]);

  return { data, error, retry: () => { setError(null); setAttempt((value) => value + 1); } };
}
