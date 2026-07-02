import { useEffect, useState } from 'react';
import type { WorkerRequest, WorkerResponse } from '../infra/workerProtocol';

let sharedWorker: Worker | null = null;
let initRequested = false;
let sharedIsReady = false;
let sharedWorkerError: string | null = null;

function getSharedWorker(): Worker {
  if (!sharedWorker) {
    // NOTE: must be a CLASSIC worker (no `{ type: 'module' }`).
    // MediaPipe's WASM loader uses importScripts() internally, which is forbidden
    // in module workers and throws "ModuleFactory not set". Vite inlines the
    // static imports below into a single classic worker bundle.
    sharedWorker = new Worker(
      new URL('../workers/handTracker.worker.ts', import.meta.url)
    );
    initRequested = false;
    sharedIsReady = false;
    sharedWorkerError = null;
  }
  return sharedWorker;
}

export function useWorker() {
  const [worker] = useState<Worker>(() => getSharedWorker());
  const [isWorkerReady, setIsWorkerReady] = useState(sharedIsReady);
  const [workerError, setWorkerError] = useState<string | null>(sharedWorkerError);

  useEffect(() => {
    const handleMessage = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.type === 'INIT_SUCCESS') {
        sharedIsReady = true;
        sharedWorkerError = null;
        setIsWorkerReady(true);
      } else if (e.data.type === 'INIT_ERROR') {
        sharedWorkerError = e.data.error;
        // 次のマウントで INIT を再送できるようにする (worker 側は landmarker が
        // null のままなので再初期化が走る)。旧実装の「再マウントで再試行」を保存。
        initRequested = false;
        setWorkerError(e.data.error);
      }
    };

    worker.addEventListener('message', handleMessage);
    if (!initRequested) {
      initRequested = true;
      worker.postMessage({ type: 'INIT' } satisfies WorkerRequest);
    }

    return () => {
      worker.removeEventListener('message', handleMessage);
    };
  }, [worker]);

  return { worker, isWorkerReady, workerError };
}
