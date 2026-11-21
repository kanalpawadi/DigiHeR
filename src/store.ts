import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Job, Site, Submission, Verdict } from './lib/types'
import { dbscan } from './lib/dbscan'

export const SEED_SITES: Site[] = [
  {
    id: 'somanatha',
    name: 'Somanatha Temple',
    place: 'Façade, Gujarat, India',
    kind: 'Nagara-style exterior with intricate sandstone carvings',
    imageUrl: '/images/somanatha-site.jpg',
    sample: 'nagara',
    reported: { rawImages: 1512, rejectedPct: 25.1, sfmSuccessPct: 98.7, meshFaces: 1_800_000, tlsRmseMm: 2.1, rmseMm: 4.6 },
  },
  {
    id: 'gopinatha',
    name: 'Gopinatha Temple',
    place: 'Interior dome, Maharashtra, India',
    kind: 'Mandala ceiling, vaulted geometry, variable ambient light',
    imageUrl: '/images/gopinatha-dome.jpg',
    sample: 'dome',
    reported: { rawImages: 968, rejectedPct: 29.8, sfmSuccessPct: 96.2, meshFaces: 1_200_000, tlsRmseMm: 3.5, rmseMm: 5.9 },
  },
]

interface State {
  sites: Site[]
  submissions: Submission[]
  jobs: Record<string, Job>
  addSite: (name: string, place: string) => string
  addSubmission: (s: Submission) => void
  removeSubmission: (id: string) => void
  resolveReview: (id: string, verdict: Exclude<Verdict, 'review'>) => void
  recluster: (siteId: string, epsMetres: number, minPts: number) => void
  setJob: (job: Job) => void
}

const safeStorage = createJSONStorage(() => {
  try {
    const probe = '__digiher__'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return localStorage
  } catch {
    const mem = new Map<string, string>()
    return {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    }
  }
})

export const useStore = create<State>()(
  persist(
    (set) => ({
      sites: SEED_SITES,
      submissions: [],
      jobs: {},
      addSite: (name, place) => {
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2, 6)
        set((s) => ({ sites: [...s.sites, { id, name, place, kind: 'Community-contributed site' }] }))
        return id
      },
      addSubmission: (sub) => set((s) => ({ submissions: [sub, ...s.submissions] })),
      removeSubmission: (id) => set((s) => ({ submissions: s.submissions.filter((x) => x.id !== id) })),
      resolveReview: (id, verdict) =>
        set((s) => ({ submissions: s.submissions.map((x) => (x.id === id ? { ...x, verdict, reviewed: true } : x)) })),
      recluster: (siteId, eps, minPts) =>
        set((s) => {
          const geo = s.submissions.filter((x) => x.siteId === siteId && x.gps)
          const labels = dbscan(geo.map((x) => x.gps!), eps, minPts)
          const byId = new Map(geo.map((x, i) => [x.id, labels[i]]))
          return {
            submissions: s.submissions.map((x) =>
              x.siteId !== siteId ? x : { ...x, cluster: x.gps ? byId.get(x.id) ?? null : null },
            ),
          }
        }),
      setJob: (job) => set((s) => ({ jobs: { ...s.jobs, [job.siteId]: job } })),
    }),
    {
      name: 'digiher-v1',
      storage: safeStorage,
      partialize: (s) => ({ sites: s.sites, submissions: s.submissions, jobs: s.jobs }),
      // Saved sites keep the user's edits, but pick up fields added to the seed sites later.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>
        const sites = (p.sites ?? current.sites).map((s) => ({ ...SEED_SITES.find((x) => x.id === s.id), ...s }))
        return { ...current, ...p, sites }
      },
    },
  ),
)
