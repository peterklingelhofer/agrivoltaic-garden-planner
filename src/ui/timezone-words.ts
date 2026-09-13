/**
 * A zone computed from the longitude alone (the fallback when no weather answer carried an
 * IANA name) is an `Etc/GMT` label, whose sign runs the POSIX way round: `Etc/GMT-10` is ten
 * hours ahead of UTC. A gardener in Melbourne read it as ten hours behind, so it is printed as
 * the offset it means, with what it does and does not know. An IANA name is printed as it is
 */
export const timezoneWords = (zone: string): string => {
  if (zone === 'Etc/GMT') return 'UTC, computed from the longitude; daylight saving not known'
  const match = /^Etc\/GMT([+-])(\d+)$/.exec(zone)
  if (match === null) return zone
  const sign = match[1] === '-' ? '+' : '-'
  return `UTC${sign}${String(Number(match[2]))}, computed from the longitude; daylight saving not known`
}
