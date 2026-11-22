import type { SplitExecutionResult, SplitOptions, Vector3MM } from '@shared/types';
import { executeAdaptiveManifoldSplit } from '../core/csgEngine';

export interface SplitWorkerRequest {
  positions: Float32Array;
  indices: Uint32Array;
  bedVolume: Vector3MM;
  options: SplitOptions;
}

export type SplitWorkerResponse =
  | { type: 'progress'; percent: number; message: string }
  | { type: 'done'; result: SplitExecutionResult }
  | { type: 'error'; error: string };

self.onmessage = async (event: MessageEvent<SplitWorkerRequest>) => {
  const { positions, indices, bedVolume, options } = event.data;
  try {
    const result = await executeAdaptiveManifoldSplit(
      positions,
      indices,
      bedVolume,
      options,
      (percent, message) => {
        self.postMessage({ type: 'progress', percent, message } satisfies SplitWorkerResponse);
      }
    );

    // Collect transferable ArrayBuffers for zero-copy return to main thread
    const transferables: Transferable[] = [];
    for (const part of result.parts) {
      if (part.positions.buffer instanceof ArrayBuffer) {
        transferables.push(part.positions.buffer);
      }
      if (part.indices.buffer instanceof ArrayBuffer) {
        transferables.push(part.indices.buffer);
      }
    }
    if (result.connectorPinMesh) {
      if (result.connectorPinMesh.positions.buffer instanceof ArrayBuffer) {
        transferables.push(result.connectorPinMesh.positions.buffer);
      }
      if (result.connectorPinMesh.indices.buffer instanceof ArrayBuffer) {
        transferables.push(result.connectorPinMesh.indices.buffer);
      }
    }

    self.postMessage({ type: 'done', result } satisfies SplitWorkerResponse, {
      transfer: transferables
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: 'error', error: message } satisfies SplitWorkerResponse);
  }
};
