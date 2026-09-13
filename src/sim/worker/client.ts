import type { GardenPlot } from '../../types/garden'
import type { Site } from '../../types/site'
import type { TmySeries } from '../../types/weather'
import type { AccumulationProgress } from '../backend'
import { handleSimRequest } from './entry'
import type { SimulationOptions, SimulationResult } from '../pipeline'
import type { SimRequest, SimRequestId, SimResponse } from './protocol'

export interface SimClient {
  run(
    site: Site,
    plot: GardenPlot,
    weather: TmySeries,
    options: SimulationOptions,
    onProgress: (progress: AccumulationProgress) => void,
  ): Promise<SimulationResult>
  cancelAll(): void
  terminate(): void
}

// FNV-1a keeps the key short and stable across sessions without pulling in a hash dependency
const hash = (value: string): string => {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

// the key must change with anything that moves a shadow and with nothing that does not:
// camera, month overlay and crop ranking are all absent by construction
export const simCacheKey = (
  site: Site,
  plot: GardenPlot,
  weather: TmySeries,
  options: SimulationOptions,
): string => {
  const arrays = plot.arrays.map((array) => [
    array.id,
    array.geometry.collectorWidthM,
    array.geometry.pitchM,
    array.geometry.rowLengthM,
    array.geometry.rowCount,
    array.geometry.modulesPerRow,
    array.geometry.clearanceHeightM,
    array.geometry.rowAzimuthDeg,
    array.geometry.originM.xM,
    array.geometry.originM.yM,
    array.module.transmittanceFraction,
    array.module.rearReflectance,
    JSON.stringify(array.tracker),
  ])
  const beds = plot.beds.map((bed) => [
    bed.id,
    bed.footprint.exterior.map((point) => `${point.xM},${point.yM}`).join(';'),
  ])
  return hash(
    JSON.stringify([
      site.location.latitudeDeg,
      site.location.longitudeDeg,
      site.elevationM,
      plot.groundCover,
      plot.northOffsetDeg,
      arrays,
      beds,
      weather.source,
      weather.decomposition,
      weather.provenance.datasetLabel,
      weather.provenance.retrievedUtcMillis,
      options,
    ]),
  )
}

const createWorker = (): Worker | null => {
  try {
    return new Worker(new URL('./entry.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    return null
  }
}

export const createSimClient = (): SimClient => {
  const worker = typeof Worker === 'undefined' ? null : createWorker()
  const pending = new Map<
    SimRequestId,
    {
      resolve: (result: SimulationResult) => void
      reject: (error: Error) => void
      onProgress: (progress: AccumulationProgress) => void
    }
  >()
  const memo = new Map<string, SimulationResult>()
  let nextId = 1

  if (worker !== null) {
    worker.addEventListener('message', (event: MessageEvent<SimResponse>) => {
      const response = event.data
      const entry = pending.get(response.id)
      if (entry === undefined) return
      if (response.type === 'progress') {
        entry.onProgress(response.progress)
        return
      }
      pending.delete(response.id)
      if (response.type === 'done') {
        memo.set(response.cacheKey, response.result)
        entry.resolve(response.result)
      } else {
        entry.reject(new Error(response.message))
      }
    })
  }

  const cancelAll = (): void => {
    for (const [id, entry] of pending) {
      worker?.postMessage({ type: 'cancel', id } satisfies SimRequest)
      entry.reject(new Error('simulation superseded'))
    }
    pending.clear()
  }

  return {
    async run(site, plot, weather, options, onProgress) {
      const cacheKey = simCacheKey(site, plot, weather, options)
      const cached = memo.get(cacheKey)
      if (cached !== undefined) return cached
      cancelAll()
      const id = nextId
      nextId += 1
      const request: SimRequest = { type: 'run', id, cacheKey, site, plot, weather, options }
      if (worker === null) {
        // no worker available: run in-process so the same protocol still applies
        return new Promise<SimulationResult>((resolve, reject) => {
          void handleSimRequest(request, (response) => {
            if (response.type === 'progress') onProgress(response.progress)
            else if (response.type === 'done') {
              memo.set(cacheKey, response.result)
              resolve(response.result)
            } else reject(new Error(response.message))
          })
        })
      }
      return new Promise<SimulationResult>((resolve, reject) => {
        pending.set(id, { resolve, reject, onProgress })
        worker.postMessage(request)
      })
    },
    cancelAll,
    terminate() {
      cancelAll()
      worker?.terminate()
    },
  }
}
