import { runSimulation } from '../pipeline'
import { rasterTransferables } from '../raster'
import type { SimRequest, SimResponse } from './protocol'

export interface SimWorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<SimRequest>) => void): void
  postMessage(message: SimResponse, transfer: Transferable[]): void
}

const cancelled = new Set<number>()

export const handleSimRequest = async (
  request: SimRequest,
  post: (response: SimResponse, transfer: readonly ArrayBufferLike[]) => void,
): Promise<void> => {
  if (request.type === 'cancel') {
    cancelled.add(request.id)
    return
  }
  cancelled.delete(request.id)
  try {
    const result = await runSimulation(
      request.site,
      request.plot,
      request.weather,
      request.options,
      (progress) => {
        if (!cancelled.has(request.id)) {
          post({ type: 'progress', id: request.id, progress }, [])
        }
      },
    )
    if (cancelled.has(request.id)) {
      cancelled.delete(request.id)
      return
    }
    post(
      { type: 'done', id: request.id, cacheKey: request.cacheKey, result },
      rasterTransferables(result.raster),
    )
  } catch (error) {
    post(
      {
        type: 'error',
        id: request.id,
        message: error instanceof Error ? error.message : String(error),
      },
      [],
    )
  }
}

export const registerSimWorker = (scope: SimWorkerScope): void => {
  scope.addEventListener('message', (event) => {
    void handleSimRequest(event.data, (response, transfer) => {
      scope.postMessage(response, transfer as Transferable[])
    })
  })
}
