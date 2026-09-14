import type { Brand } from './brand'

export type SiteId = Brand<string, 'SiteId'>
export type PlotId = Brand<string, 'PlotId'>
export type BedId = Brand<string, 'BedId'>
export type ArrayId = Brand<string, 'ArrayId'>
export type ObstructionId = Brand<string, 'ObstructionId'>
export type PanelId = Brand<string, 'PanelId'>
export type CropId = Brand<string, 'CropId'>
export type CultivarId = Brand<string, 'CultivarId'>
export type PlantingId = Brand<string, 'PlantingId'>
export type RuleId = Brand<string, 'RuleId'>
export type TekRuleId = Brand<string, 'TekRuleId'>

const asId = <T extends string>(value: string): T => value as T

export const siteId = asId<SiteId>
export const plotId = asId<PlotId>
export const bedId = asId<BedId>
export const arrayId = asId<ArrayId>
export const obstructionId = asId<ObstructionId>
export const panelId = asId<PanelId>
export const cropId = asId<CropId>
export const cultivarId = asId<CultivarId>
export const plantingId = asId<PlantingId>
export const ruleId = asId<RuleId>
export const tekRuleId = asId<TekRuleId>
