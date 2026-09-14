/**
 * A zone computed from the longitude alone (the last-resort fallback, where even the nearest
 * zone.tab city was unknown) is an `Etc/GMT` label, whose sign runs the POSIX way round:
 * `Etc/GMT-10` is ten hours ahead of UTC. A gardener in Melbourne read it as ten hours behind, so
 * it is printed as the offset it means, with what it does and does not know. An IANA name is
 * printed as it is, and a name read off the nearest zone.tab city says so rather than claiming
 * the weather service named it
 */
export const timezoneWords = (
  zone: string,
  basis: 'upstream' | 'nearest-zone' = 'upstream',
): string => {
  if (zone === 'Etc/GMT') return 'UTC, computed from the longitude; daylight saving not known'
  const match = /^Etc\/GMT([+-])(\d+)$/.exec(zone)
  if (match !== null) {
    const sign = match[1] === '-' ? '+' : '-'
    return `UTC${sign}${String(Number(match[2]))}, computed from the longitude; daylight saving not known`
  }
  if (basis === 'nearest-zone')
    return `${zone}, the nearest time zone on record to this point; the weather service named none`
  return zone
}
