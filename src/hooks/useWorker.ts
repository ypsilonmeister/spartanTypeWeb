import { useEffect, useState } from 'react';

export function useWorker() {
  const [worker] = useState<Worker>(() => new Worker(
    new URL('../workers/handTracker.worker.ts', import.meta.url), 
    { type: 'module' }
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
