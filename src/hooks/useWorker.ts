import { useEffect, useState } from 'react';

export function useWorker() {
  // NOTE: must be a CLASSIC worker (no `{ type: 'module' }`).
  // MediaPipe's WASM loader uses importScripts() internally, which is forbidden
  // in module workers and throws "ModuleFactory not set". Vite inlines the
  // static imports below into a single classic worker bundle.
  const [worker] = useState<Worker>(() => new Worker(
    new URL('../workers/handTracker.worker.ts', import.meta.url)
  ));
  const [isWorkerReady, setIsWorkerReady] = useState(false);
  const [workerError, setWorkerError] = useState<string | null>(null);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      const { type, error } = e.data;
      if (type === 'INIT_SUCCESS') {
        setIsWorkerReady(true);
      } else if (type === 'INIT_ERROR') {
        setWorkerError(error);
      }
    };

    worker.addEventListener('message', handleMessage);
    worker.postMessage({ type: 'INIT' });

    return () => {
      worker.removeEventListener('message', handleMessage);
      worker.terminate();
    };
  }, [worker]);

  return { worker, isWorkerReady, workerError };
}
