export type Verdict = 'accepted' | 'review' | 'rejected'

export interface GeoPoint {
  lat: number
  lon: number
}

/** Per-image quality scores, all normalised to 0..1. */
export interface IqaScores {
  sharpness: number
  exposure: number
  noise: number
  texture: number
  contrast: number
  colorfulness: number
  dynamicRange: number
  /** Technical quality Q_T (structural, SfM-relevant). */
  qT: number
  /** Perceptual quality Q_A. */
  qA: number
  /** Composite S_IQA = w_T·Q_T + w_A·Q_A. */
  s: number
}

export interface Submission {
  id: string
  siteId: string
  fileName: string
  thumbUrl: string
  width: number
  height: number
  gps: GeoPoint | null
  scores: IqaScores | null
  verdict: Verdict
  reasons: string[]
  /** DBSCAN cluster id; -1 = noise, null = no GPS. */
  cluster: number | null
  /** True when the photo is stored on the backend (its id is the server id). */
  uploaded?: boolean
  /** Set when a reviewer resolves a "review" verdict. */
  reviewed?: boolean
  createdAt: number
}

export type StageId = 'cluster' | 'iqa' | 'sfm' | 'mvs' | 'decimate' | 'export'
export type StageState = 'waiting' | 'running' | 'done' | 'failed'

export interface Stage {
  id: StageId
  label: string
  detail: string
  state: StageState
}

export interface Job {
  id: string
  siteId: string
  startedAt: number
  stages: Stage[]
  /** True when produced by the in-browser simulator rather than a real backend. */
  simulated: boolean
  result?: { faces: number; sparsePoints: number; acceptedImages: number; modelUrl?: string; note?: string }
}

export interface Site {
  id: string
  name: string
  place: string
  kind: string
  /** AI generated photo or reference thumbnail */
  imageUrl?: string
  /** Built-in illustration model shown until a real GLB is attached. */
  sample?: 'nagara' | 'dome'
  /** Figures reported in the DigiHeR paper (Tables 2 & 3), when available. */
  reported?: {
    rawImages: number
    rejectedPct: number
    sfmSuccessPct: number
    meshFaces: number
    tlsRmseMm: number
    rmseMm: number
  }
}
