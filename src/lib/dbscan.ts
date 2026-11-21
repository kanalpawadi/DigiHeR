import type { GeoPoint } from './types'

const R = 6371000

/** Great-circle distance in metres. */
export function haversine(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * DBSCAN over geotagged photos (paper §5.2). Returns a label per point:
 * 0..k-1 for clusters, -1 for noise. No cluster count is assumed up front.
 */
export function dbscan(points: GeoPoint[], epsMetres = 30, minPts = 3): number[] {
  const labels = new Array<number>(points.length).fill(-2) // -2 = unvisited
  const neighbours = (i: number) => {
    const out: number[] = []
    for (let j = 0; j < points.length; j++) if (haversine(points[i], points[j]) <= epsMetres) out.push(j)
    return out
  }
  let cluster = 0
  for (let i = 0; i < points.length; i++) {
    if (labels[i] !== -2) continue
    const seeds = neighbours(i)
    if (seeds.length < minPts) { labels[i] = -1; continue }
    labels[i] = cluster
    const queue = seeds.filter((j) => j !== i)
    while (queue.length) {
      const j = queue.shift()!
      if (labels[j] === -1) labels[j] = cluster
      if (labels[j] !== -2) continue
      labels[j] = cluster
      const nb = neighbours(j)
      if (nb.length >= minPts) queue.push(...nb)
    }
    cluster++
  }
  return labels
}
