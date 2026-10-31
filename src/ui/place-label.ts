/**
 * A geocoder label as a name and the region under it: "Springfield, Illinois" is the town in
 * bold and the state in small type, and the coordinates aren't printed at all. Two Springfields
 * are told apart by their region, which is how a person tells them apart
 */
export const splitLabel = (label: string): readonly [string, string | undefined] => {
  const comma = label.indexOf(',')
  return comma === -1
    ? [label, undefined]
    : [label.slice(0, comma).trim(), label.slice(comma + 1).trim() || undefined]
}
