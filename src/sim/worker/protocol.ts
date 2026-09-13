import type { GardenPlot } from '../../types/garden'
import type { Site } from '../../types/site'
import type { TmySeries } from '../../types/weather'
import type { AccumulationProgress } from '../backend'
import type { SimulationOptions, SimulationResult } from '../pipeline'

export type SimRequestId = number

export interface SimRunRequest {
  readonly type: 'run'
  readonly id: SimRequestId
  readonly cacheKey: string
  readonly site: Site
  readonly plot: GardenPlot
  readonly weather: TmySeries
  readonly options: SimulationOptions
}

export interface SimCancelRequest {
  readonly type: 'cancel'
  readonly id: SimRequestId
}

export type SimRequest = SimRunRequest | SimCancelRequest

export interface SimProgressResponse {
  readonly type: 'progress'
  readonly id: SimRequestId
  readonly progress: AccumulationProgress
}

export interface SimDoneResponse {
  readonly type: 'done'
  readonly id: SimRequestId
  readonly cacheKey: string
  readonly result: SimulationResult
}

export interface SimErrorResponse {
  readonly type: 'error'
  readonly id: SimRequestId
  readonly message: string
}

export type SimResponse = SimProgressResponse | SimDoneResponse | SimErrorResponse
