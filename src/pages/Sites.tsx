import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { useStore } from '../store'
import { followJob, startReconstruction, useBackend } from '../services/api'
import type { Submission } from '../lib/types'

/** Structure-from-Motion cannot triangulate anything from fewer views. */
const MIN_PHOTOS = 3

export default function Sites() {
  const { siteId } = useParams()
  const sites = useStore((s) => s.sites)
  const site = sites.find((s) => s.id === siteId) ?? sites[0]
  return (
    <div className="page split">
      <aside className="sitelist" aria-label="Sites">
        <h2 className="h-small">Sites</h2>
        <ul>
          {sites.map((s) => (
            <li key={s.id}>
              <NavLink to={`/sites/${s.id}`} className={() => (s.id === site.id ? 'active' : undefined)}>
                {s.imageUrl && (
                  <div className="sitelist-thumb">
                    <img src={s.imageUrl} alt={s.name} />
                  </div>
                )}
                <div className="sitelist-info">
                  <strong>{s.name}</strong>
                  <span className="small muted">{s.place}</span>
                </div>
              </NavLink>
            </li>
          ))}
        </ul>
        <Link className="small" to="/contribute">Add a site</Link>
      </aside>
      <SiteDetail key={site.id} siteId={site.id} />
    </div>
  )
}

function SiteDetail({ siteId }: { siteId: string }) {
  const site = useStore((s) => s.sites.find((x) => x.id === siteId))!
  const allSubs = useStore((s) => s.submissions)
  const job = useStore((s) => s.jobs[siteId])
  const setJob = useStore((s) => s.setJob)
  const recluster = useStore((s) => s.recluster)
  const subs = useMemo(() => allSubs.filter((x) => x.siteId === siteId), [allSubs, siteId])
  const backend = useBackend()
  const acceptedAll = subs.filter((s) => s.verdict === 'accepted')
  // With a backend, only photos stored on the server can be reconstructed.
  const accepted = backend ? acceptedAll.filter((s) => s.uploaded) : acceptedAll
  const notUploaded = acceptedAll.length - accepted.length
  const [eps, setEps] = useState(30)
  const [minPts, setMinPts] = useState(3)
  const [error, setError] = useState<string | null>(null)
  const running = !!job && job.stages.some((s) => s.state === 'running' || s.state === 'waiting') && !job.stages.some((s) => s.state === 'failed')

  // A real job keeps running on the server while the page is closed: pick it up again.
  useEffect(() => {
    if (job && !job.simulated && running && backend) {
      followJob(job.id, setJob).catch((e) => setError(e instanceof Error ? e.message : String(e)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend])

  async function start() {
    setError(null)
    try {
      await startReconstruction({ siteId, imageIds: accepted.map((s) => s.id) }, setJob)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The reconstruction could not start.')
    }
  }

  return (
    <section className="detail">
      {site.imageUrl && (
        <div className="site-detail-banner">
          <img src={site.imageUrl} alt={site.name} />
          <div className="site-detail-banner-overlay" />
          <div className="site-detail-banner-content">
            <span className="site-badge">{site.kind}</span>
            <h1>{site.name}</h1>
            <p>{site.place}</p>
          </div>
        </div>
      )}
      {!site.imageUrl && (
        <>
          <h1>{site.name}</h1>
          <p className="muted">{site.place}. {site.kind}.</p>
        </>
      )}

      {site.reported && (
        <dl className="figs compact">
          <div><dt>Photos collected</dt><dd>{site.reported.rawImages.toLocaleString()}</dd></div>
          <div><dt>Rejected by AI</dt><dd>{site.reported.rejectedPct}%</dd></div>
          <div><dt>SfM success</dt><dd>{site.reported.sfmSuccessPct}%</dd></div>
          <div><dt>Final mesh</dt><dd>{(site.reported.meshFaces / 1e6).toFixed(1)}M faces</dd></div>
          <div><dt>Error vs. laser scan</dt><dd>{site.reported.rmseMm} mm</dd></div>
        </dl>
      )}
      {site.reported && <p className="small muted">Figures above are from the paper. Everything below reflects photos uploaded in this browser.</p>}

      <p><Link className="btn" to={`/viewer?site=${siteId}`}>View {site.name} in 3D and AR</Link></p>

      <h2>Photo locations</h2>
      <div className="row wrap gap end">
        <label className="field narrowfield">
          <span>Radius (m)</span>
          <input type="number" min={1} max={500} value={eps} onChange={(e) => setEps(Number(e.target.value))} />
        </label>
        <label className="field narrowfield">
          <span>Min. photos</span>
          <input type="number" min={1} max={20} value={minPts} onChange={(e) => setMinPts(Number(e.target.value))} />
        </label>
        <button className="btn" onClick={() => recluster(siteId, eps, minPts)}>Regroup</button>
      </div>
      <ClusterPlot subs={subs} />

      <h2>Reconstruction</h2>
      <p>
        {accepted.length} accepted photo{accepted.length === 1 ? '' : 's'} ready.{' '}
        {accepted.length < MIN_PHOTOS && (
          <>
            3D reconstruction needs at least {MIN_PHOTOS} accepted photos of the same structure from different
            positions. <Link to="/contribute">Add {MIN_PHOTOS - accepted.length} more</Link>.
          </>
        )}
      </p>
      {backend && notUploaded > 0 && (
        <p className="small muted">
          {notUploaded} accepted photo{notUploaded === 1 ? ' was' : 's were'} checked before the server was running, so {notUploaded === 1 ? "it isn't" : "they aren't"} counted. Remove and upload {notUploaded === 1 ? 'it' : 'them'} again to include {notUploaded === 1 ? 'it' : 'them'}.
        </p>
      )}
      <button className="btn primary" onClick={start} disabled={running || accepted.length < MIN_PHOTOS}>
        {running ? 'Reconstructing…' : job ? 'Reconstruct again' : 'Start reconstruction'}
      </button>
      {backend === null && <p className="notice small">The server isn't running, so the stages below are only a simulation and no real model is made.</p>}
      {backend && <p className="small muted">Runs on the server with COLMAP. With 20–50 photos, expect a few minutes.</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {job && (
        <ol className="pipeline">
          {job.stages.map((s) => (
            <li key={s.id} className={s.state}>
              <span className="dot" aria-hidden="true" />
              <div>
                <strong>{s.label}</strong> <span className="state">{stateLabel(s.state)}</span>
                <p className="small muted">{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {job?.result && (
        <div className="result">
          <p>
            Model ready: {job.result.sparsePoints.toLocaleString()} sparse points, {job.result.faces.toLocaleString()} faces
            from {job.result.acceptedImages} photos{job.simulated ? ' (simulated, no real model was made)' : ''}.
          </p>
          {job.result.note && <p className="small muted">{job.result.note}.</p>}
          <Link className="btn" to={`/viewer?site=${siteId}`}>Open in viewer</Link>
        </div>
      )}
    </section>
  )
}

const stateLabel = (s: string) => ({ waiting: 'Waiting', running: 'Running', done: 'Done', failed: 'Failed' })[s] ?? s

function ClusterPlot({ subs }: { subs: Submission[] }) {
  const geo = subs.filter((s) => s.gps)
  if (!geo.length) {
    return <p className="empty">None of these photos has GPS data. Turn on location tagging in your phone camera so photos can be grouped by where they were taken.</p>
  }
  const lats = geo.map((s) => s.gps!.lat)
  const lons = geo.map((s) => s.gps!.lon)
  const [minLat, maxLat, minLon, maxLon] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)]
  const W = 560, H = 260, P = 24
  const sx = (lon: number) => P + ((lon - minLon) / (maxLon - minLon || 1e-9)) * (W - 2 * P)
  const sy = (lat: number) => H - P - ((lat - minLat) / (maxLat - minLat || 1e-9)) * (H - 2 * P)
  const clusters = [...new Set(geo.map((s) => s.cluster).filter((c): c is number => c !== null && c >= 0))].sort((a, b) => a - b)
  // Scatter: categorical colour for the first 3 clusters only; the rest fold into "Other".
  const color = (c: number | null) => {
    if (c === null || c < 0) return null
    const i = clusters.indexOf(c)
    return i < 3 ? `var(--series-${i + 1})` : 'var(--series-other)'
  }
  const noise = geo.filter((s) => s.cluster === -1).length
  return (
    <figure className="plot">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${geo.length} geotagged photos in ${clusters.length} groups, ${noise} outliers`}>
        <rect x="0" y="0" width={W} height={H} fill="var(--surface)" />
        {geo.map((s) => {
          const c = color(s.cluster)
          return (
            <circle key={s.id} cx={sx(s.gps!.lon)} cy={sy(s.gps!.lat)} r={5}
              fill={c ?? 'none'} stroke={c ? 'var(--surface)' : 'var(--ink-3)'} strokeWidth={c ? 2 : 1.5}>
              <title>{s.fileName}{s.cluster === -1 ? ' (outlier)' : ` (group ${clusters.indexOf(s.cluster!) + 1})`}</title>
            </circle>
          )
        })}
      </svg>
      <figcaption className="legend">
        {clusters.slice(0, 3).map((c, i) => (
          <span key={c}><i style={{ background: `var(--series-${i + 1})` }} />Group {i + 1}</span>
        ))}
        {clusters.length > 3 && <span><i style={{ background: 'var(--series-other)' }} />{clusters.length - 3} more groups</span>}
        <span><i className="hollow" />Outliers ({noise})</span>
      </figcaption>
    </figure>
  )
}
