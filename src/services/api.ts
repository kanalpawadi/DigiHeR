import { useEffect, useState } from 'react'
import type { GeoPoint, IqaScores, Job, Stage, StageId, Verdict } from '../lib/types'

/**
 * The single seam between this frontend and the DigiHeR backend
 * (FastAPI gateway → IQA → COLMAP → mesh → GLB), reached through Vite's
 * /api proxy so the same address works on a phone over HTTPS.
 *
 * If the backend isn't running, a simulator stands in. Simulated jobs are
 * marked `simulated: true` and the UI says so.
 */

export const API_URL: string = import.meta.env.VITE_API_URL || '/api'

export interface BackendHealth {
  ok: boolean
  iqaModel: string
  colmap: string
  cuda: boolean
  dense: string
}

let healthPromise: Promise<BackendHealth | null> | null = null

/** Checks once per page load whether the backend is reachable. */
export function checkBackend(force = false): Promise<BackendHealth | null> {
  if (!healthPromise || force) {
    healthPromise = fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(4000) })
      .then((r) => (r.ok ? (r.json() as Promise<BackendHealth>) : null))
      .catch(() => null)
  }
  return healthPromise
}

/** undefined while checking, null when offline. */
export function useBackend() {
  const [health, setHealth] = useState<BackendHealth | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    checkBackend().then((h) => live && setHealth(h))
    return () => { live = false }
  }, [])
  return health
}

// ------------------------------------------------------------------ images

export interface ServerImage {
  id: string
  siteId: string
  fileName: string
  width: number
  height: number
  gps: GeoPoint | null
  scores: IqaScores | null
  verdict: Verdict
  reasons: string[]
}

async function errorText(res: Response) {
  try {
    const body = await res.json()
    return typeof body.detail === 'string' ? body.detail : `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

export async function uploadImage(siteId: string, file: File): Promise<ServerImage> {
  const form = new FormData()
  form.append('siteId', siteId)
  form.append('file', file)
  const res = await fetch(`${API_URL}/images`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(await errorText(res))
  return res.json()
}

export async function deleteImage(id: string): Promise<void> {
  await fetch(`${API_URL}/images/${id}`, { method: 'DELETE' }).catch(() => undefined)
}

// --------------------------------------------------------------- models

export async function siteModelUrl(siteId: string): Promise<string | null> {
  if (!(await checkBackend())) return null
  try {
    const res = await fetch(`${API_URL}/sites/${encodeURIComponent(siteId)}/model`)
    if (!res.ok) return null
    const info = (await res.json()) as { available: boolean; url?: string; updatedAt?: number }
    return info.available ? `${API_URL}${info.url}?v=${info.updatedAt}` : null
  } catch {
    return null
  }
}

// -------------------------------------------------------- reconstruction

const MOCK_STAGES: Array<{ id: StageId; label: string; detail: string }> = [
  { id: 'cluster', label: 'Geospatial clustering', detail: 'DBSCAN on photo GPS removes duplicates and outliers' },
  { id: 'iqa', label: 'AI quality check', detail: 'ResNet-50 scores S_IQA; images below 0.65 are dropped' },
  { id: 'sfm', label: 'Structure-from-Motion', detail: 'COLMAP: SIFT features, matching, RANSAC, bundle adjustment' },
  { id: 'mvs', label: 'Multi-View Stereo', detail: 'OpenMVS: depth maps, dense cloud, mesh, texture' },
  { id: 'decimate', label: 'Mesh decimation', detail: 'Quadric Error Metrics down to 50k–200k faces' },
  { id: 'export', label: 'GLB export', detail: 'Serialise to glTF binary for WebXR' },
]

export interface StartRequest {
  siteId: string
  imageIds: string[]
}

const isFinished = (job: Job) => job.stages.every((s) => s.state === 'done') || job.stages.some((s) => s.state === 'failed')

async function simulate({ siteId, imageIds }: StartRequest, onUpdate: (job: Job) => void): Promise<Job> {
  const job: Job = {
    id: crypto.randomUUID(),
    siteId,
    startedAt: Date.now(),
    stages: MOCK_STAGES.map((s): Stage => ({ ...s, state: 'waiting' })),
    simulated: true,
  }
  const durations = [700, 900, 2200, 2600, 1100, 600]
  for (let i = 0; i < job.stages.length; i++) {
    job.stages = job.stages.map((s, k) => (k === i ? { ...s, state: 'running' } : s))
    onUpdate({ ...job })
    await new Promise((r) => setTimeout(r, durations[i]))
    if (job.stages[i].id === 'sfm' && imageIds.length < 3) {
      job.stages = job.stages.map((s, k) => (k === i ? { ...s, state: 'failed', detail: 'Needs at least 3 accepted, overlapping images' } : s))
      onUpdate({ ...job })
      return job
    }
    job.stages = job.stages.map((s, k) => (k === i ? { ...s, state: 'done' } : s))
  }
  const n = imageIds.length
  job.result = { acceptedImages: n, sparsePoints: Math.round(n * 1450), faces: Math.min(200_000, Math.max(50_000, n * 1200)) }
  onUpdate({ ...job })
  return job
}

/** Polls a backend job until it finishes. Safe to call again after a page reload. */
export async function followJob(jobId: string, onUpdate: (job: Job) => void): Promise<Job> {
  for (;;) {
    const res = await fetch(`${API_URL}/reconstructions/${jobId}`)
    if (!res.ok) throw new Error(await errorText(res))
    const job = (await res.json()) as Job
    onUpdate(job)
    if (isFinished(job)) return job
    await new Promise((r) => setTimeout(r, 2000))
  }
}

export async function startReconstruction(req: StartRequest, onUpdate: (job: Job) => void): Promise<Job> {
  if (!(await checkBackend())) return simulate(req, onUpdate)
  const res = await fetch(`${API_URL}/reconstructions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error(await errorText(res))
  const job = (await res.json()) as Job
  onUpdate(job)
  return followJob(job.id, onUpdate)
}
