import type { IqaScores, Verdict } from './types'

/**
 * Lightweight, no-reference Image Quality Assessment that runs in the browser.
 *
 * The DigiHeR paper specifies a ResNet-50 + NIMA model on the backend. This
 * module is the client-side pre-filter: it computes classical measures of the
 * same properties the paper names (sharpness, lighting, noise, texture for
 * Q_T; contrast and colour for Q_A) and combines them with the paper's exact
 * weights and threshold. When the backend exists, its score replaces this one.
 */

export const W_T = 0.7
export const W_A = 0.3
export const THRESHOLD = 0.65
/** Scores in [REVIEW_FLOOR, THRESHOLD) are flagged for human review rather than dropped. */
export const REVIEW_FLOOR = 0.55
export const MIN_W = 1024
export const MIN_H = 768
export const MIN_PIXELS = MIN_W * MIN_H
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png']

const ANALYSIS_SIZE = 512
const clamp = (v: number) => Math.min(1, Math.max(0, v))

export interface IqaResult {
  width: number
  height: number
  scores: IqaScores | null
  verdict: Verdict
  reasons: string[]
  thumbUrl: string
}

export async function assessImage(file: File): Promise<IqaResult> {
  const reasons: string[] = []
  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap
  const thumbUrl = await makeThumb(bitmap)

  if (!ACCEPTED_TYPES.includes(file.type)) {
    reasons.push(`Format ${file.type || 'unknown'} is not JPEG or PNG`)
  }
  // The paper's 1024×768 minimum is about detail, so compare total pixels and
  // allow any aspect ratio (a 1280×720 photo has more detail than 1024×768).
  const longSide = Math.max(width, height)
  if (width * height < MIN_PIXELS || longSide < MIN_W) {
    const mp = (width * height) / 1e6
    reasons.push(`${width}×${height} is ${mp.toFixed(2)} MP; at least ${(MIN_PIXELS / 1e6).toFixed(2)} MP (${MIN_W}×${MIN_H}) is needed`)
  }
  if (reasons.length) {
    bitmap.close()
    return { width, height, scores: null, verdict: 'rejected', reasons, thumbUrl }
  }

  const scores = scoreBitmap(bitmap)
  bitmap.close()

  let verdict: Verdict = 'accepted'
  if (scores.s < THRESHOLD) verdict = scores.s >= REVIEW_FLOOR ? 'review' : 'rejected'
  if (verdict !== 'accepted') reasons.push(...explain(scores))
  return { width, height, scores, verdict, reasons, thumbUrl }
}

function explain(s: IqaScores): string[] {
  const out: string[] = []
  if (s.sharpness < 0.5) out.push('Blurred or out of focus')
  if (s.exposure < 0.5) out.push('Under- or over-exposed')
  if (s.noise < 0.5) out.push('High sensor noise')
  if (s.texture < 0.4) out.push('Too little surface detail for feature matching')
  if (s.contrast < 0.4) out.push('Flat, low-contrast lighting')
  if (!out.length) out.push(`Overall score ${s.s.toFixed(2)} is below ${THRESHOLD}`)
  return out
}

async function makeThumb(bitmap: ImageBitmap): Promise<string> {
  const scale = 240 / Math.max(bitmap.width, bitmap.height)
  const c = document.createElement('canvas')
  c.width = Math.round(bitmap.width * scale)
  c.height = Math.round(bitmap.height * scale)
  c.getContext('2d')!.drawImage(bitmap, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.8)
}

export function scoreBitmap(bitmap: ImageBitmap): IqaScores {
  const scale = ANALYSIS_SIZE / Math.max(bitmap.width, bitmap.height)
  const w = Math.max(8, Math.round(bitmap.width * scale))
  const h = Math.max(8, Math.round(bitmap.height * scale))
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)
  return scorePixels(data, w, h)
}

/** Pure function over RGBA pixels, kept separate so it can be unit-tested. */
export function scorePixels(data: Uint8ClampedArray, w: number, h: number): IqaScores {
  const n = w * h
  const lum = new Float32Array(n)
  let sum = 0
  let clipped = 0
  let rgSum = 0, ybSum = 0, rgSq = 0, ybSq = 0
  for (let i = 0; i < n; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    lum[i] = y
    sum += y
    if (y < 5 || y > 250) clipped++
    const rg = r - g
    const yb = 0.5 * (r + g) - b
    rgSum += rg; ybSum += yb; rgSq += rg * rg; ybSq += yb * yb
  }
  const mean = sum / n
  let varSum = 0
  for (let i = 0; i < n; i++) varSum += (lum[i] - mean) ** 2
  const std = Math.sqrt(varSum / n)

  // Sharpness: variance of the Laplacian. Noise: Immerkær's fast estimator.
  // Texture: share of pixels with a strong gradient (feature-rich surface).
  let lapSum = 0, lapSq = 0, noiseAcc = 0, strong = 0
  const inner = (w - 2) * (h - 2)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const c = lum[i], l = lum[i - 1], r = lum[i + 1], u = lum[i - w], d = lum[i + w]
      const lap = l + r + u + d - 4 * c
      lapSum += lap
      lapSq += lap * lap
      const ul = lum[i - w - 1], ur = lum[i - w + 1], dl = lum[i + w - 1], dr = lum[i + w + 1]
      noiseAcc += Math.abs(ul + ur + dl + dr - 2 * (u + d + l + r) + 4 * c)
      const gx = r - l, gy = d - u
      if (gx * gx + gy * gy > 40 * 40) strong++
    }
  }
  const lapMean = lapSum / inner
  const lapVar = lapSq / inner - lapMean * lapMean
  const sigma = Math.sqrt(Math.PI / 2) * noiseAcc / (6 * inner)

  // Dynamic range from the 2nd–98th luminance percentiles.
  const hist = new Uint32Array(256)
  for (let i = 0; i < n; i++) hist[Math.min(255, lum[i] | 0)]++
  const pct = (p: number) => {
    let acc = 0
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= p * n) return v }
    return 255
  }
  const range = pct(0.98) - pct(0.02)

  const rgMean = rgSum / n, ybMean = ybSum / n
  const rgStd = Math.sqrt(Math.max(0, rgSq / n - rgMean ** 2))
  const ybStd = Math.sqrt(Math.max(0, ybSq / n - ybMean ** 2))
  const colorfulness = Math.sqrt(rgStd ** 2 + ybStd ** 2) + 0.3 * Math.sqrt(rgMean ** 2 + ybMean ** 2)

  const sharpness = clamp(1 - Math.exp(-lapVar / 180))
  const exposure = clamp(1 - Math.abs(mean / 255 - 0.5) * 1.6 - (clipped / n) * 2)
  const noise = clamp(1 - Math.max(0, sigma - 2) / 14)
  const texture = clamp(strong / inner / 0.12)
  const contrast = clamp(std / 60)
  const colorQ = clamp(colorfulness / 60)
  const dynamicRange = clamp(range / 200)

  const qT = 0.4 * sharpness + 0.2 * exposure + 0.2 * noise + 0.2 * texture
  const qA = 0.5 * contrast + 0.3 * colorQ + 0.2 * dynamicRange
  const s = W_T * qT + W_A * qA
  return { sharpness, exposure, noise, texture, contrast, colorfulness: colorQ, dynamicRange, qT, qA, s }
}
