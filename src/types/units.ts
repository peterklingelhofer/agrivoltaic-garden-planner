import { brandNumber, type Brand } from './brand'

export type Degrees = Brand<number, 'Degrees'>
export type Radians = Brand<number, 'Radians'>
export type DegreesLatitude = Brand<number, 'DegreesLatitude'>
export type DegreesLongitude = Brand<number, 'DegreesLongitude'>

export type Meters = Brand<number, 'Meters'>
export type Millimeters = Brand<number, 'Millimeters'>
export type SquareMeters = Brand<number, 'SquareMeters'>

export type WattsPerM2 = Brand<number, 'WattsPerM2'>
export type WattsPerM2Sr = Brand<number, 'WattsPerM2Sr'>
export type MegajoulesPerM2Day = Brand<number, 'MegajoulesPerM2Day'>
export type KwhPerM2Day = Brand<number, 'KwhPerM2Day'>
export type MicromolPerM2Sec = Brand<number, 'MicromolPerM2Sec'>
export type MolPerM2Day = Brand<number, 'MolPerM2Day'>

export type Celsius = Brand<number, 'Celsius'>
export type MetersPerSecond = Brand<number, 'MetersPerSecond'>
export type Millibars = Brand<number, 'Millibars'>
export type MillimetersPerYear = Brand<number, 'MillimetersPerYear'>
export type PhUnits = Brand<number, 'PhUnits'>

export type DegreeDaysC = Brand<number, 'DegreeDaysC'>
export type ChillHours = Brand<number, 'ChillHours'>
export type UtahChillUnits = Brand<number, 'UtahChillUnits'>
export type ChillPortions = Brand<number, 'ChillPortions'>

export type KgPerM2Season = Brand<number, 'KgPerM2Season'>
export type WattsPeak = Brand<number, 'WattsPeak'>
export type KilowattsDc = Brand<number, 'KilowattsDc'>
export type KilowattsAc = Brand<number, 'KilowattsAc'>
export type KilowattHours = Brand<number, 'KilowattHours'>
export type KwhPerKwp = Brand<number, 'KwhPerKwp'>

export type Fraction = Brand<number, 'Fraction'>
export type Ratio = Brand<number, 'Ratio'>
export type Hours = Brand<number, 'Hours'>
export type Days = Brand<number, 'Days'>
export type Minutes = Brand<number, 'Minutes'>
export type Seconds = Brand<number, 'Seconds'>
export type EpochMillis = Brand<number, 'EpochMillis'>

export type DayOfYear = Brand<number, 'DayOfYear'>
export type MonthIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
export type HourOfYear = Brand<number, 'HourOfYear'>

export const degrees = brandNumber<Degrees>()
export const radians = brandNumber<Radians>()
export const degreesLatitude = brandNumber<DegreesLatitude>()
export const degreesLongitude = brandNumber<DegreesLongitude>()
export const meters = brandNumber<Meters>()
export const millimeters = brandNumber<Millimeters>()
export const squareMeters = brandNumber<SquareMeters>()
export const wattsPerM2 = brandNumber<WattsPerM2>()
export const wattsPerM2Sr = brandNumber<WattsPerM2Sr>()
export const megajoulesPerM2Day = brandNumber<MegajoulesPerM2Day>()
export const kwhPerM2Day = brandNumber<KwhPerM2Day>()
export const micromolPerM2Sec = brandNumber<MicromolPerM2Sec>()
export const molPerM2Day = brandNumber<MolPerM2Day>()
export const celsius = brandNumber<Celsius>()
export const metersPerSecond = brandNumber<MetersPerSecond>()
export const millibars = brandNumber<Millibars>()
export const millimetersPerYear = brandNumber<MillimetersPerYear>()
export const phUnits = brandNumber<PhUnits>()
export const degreeDaysC = brandNumber<DegreeDaysC>()
export const chillHours = brandNumber<ChillHours>()
export const utahChillUnits = brandNumber<UtahChillUnits>()
export const chillPortions = brandNumber<ChillPortions>()
export const kgPerM2Season = brandNumber<KgPerM2Season>()
export const wattsPeak = brandNumber<WattsPeak>()
export const kilowattsDc = brandNumber<KilowattsDc>()
export const kilowattsAc = brandNumber<KilowattsAc>()
export const kilowattHours = brandNumber<KilowattHours>()
export const kwhPerKwp = brandNumber<KwhPerKwp>()
export const fraction = brandNumber<Fraction>()
export const ratio = brandNumber<Ratio>()
export const hours = brandNumber<Hours>()
export const days = brandNumber<Days>()
export const minutes = brandNumber<Minutes>()
export const seconds = brandNumber<Seconds>()
export const epochMillis = brandNumber<EpochMillis>()
export const dayOfYear = brandNumber<DayOfYear>()
export const hourOfYear = brandNumber<HourOfYear>()

export const MONTHS: readonly MonthIndex[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

export type ByMonth<T> = readonly [T, T, T, T, T, T, T, T, T, T, T, T]
