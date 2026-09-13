/**
 * How cloudy an hour was, read off the record rather than invented.
 *
 * The clearness index is the measured global horizontal irradiance over the extraterrestrial
 * irradiance on the same horizontal plane (Liu and Jordan 1960): 1 would be no atmosphere at
 * all, a clear sky sits around 0.7 to 0.8, and overcast falls below 0.3. The scene reads the
 * hour's cloud as how far the measured sun fell short of a clear one, which is the only cloud
 * claim the model can make, because the record is what the season ran on. It says nothing
 * below a sun five degrees up, where the index is dominated by the horizon and the answer would
 * be noise dressed as weather
 */

/** The clearness index of a clear sky at low air mass, the ceiling the cloud is read against */
export const KT_CLEAR = 0.75

/** Below this the sun is on the horizon and the index says nothing about the sky */
const MIN_COS_ZENITH = Math.cos((85 * Math.PI) / 180)

export const clearnessIndex = (
  ghiWM2: number,
  zenithDeg: number,
  extraterrestrialNormalWM2: number,
): number | null => {
  const cosZenith = Math.cos((zenithDeg * Math.PI) / 180)
  if (cosZenith < MIN_COS_ZENITH || extraterrestrialNormalWM2 <= 0) return null
  const horizontal = extraterrestrialNormalWM2 * cosZenith
  return Math.max(0, ghiWM2) / horizontal
}

/** 0 for a clear hour, 1 for one in which the sun did not reach the ground at all */
export const cloudCover = (kt: number | null): number =>
  kt === null ? 0 : Math.min(1, Math.max(0, 1 - kt / KT_CLEAR))
