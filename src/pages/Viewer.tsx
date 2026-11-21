import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ModelViewer, useArSupport, type ModelStats } from '../components/ModelViewer'
import type { ReconStage } from '../components/TempleModel'
import { useStore } from '../store'
import { deleteSiteModel, loadSiteModel, saveSiteModel } from '../lib/modelStore'
import { siteModelUrl } from '../services/api'

const FACE_MIN = 50_000
const FACE_MAX = 200_000

export default function Viewer() {
  const sites = useStore((s) => s.sites)
  const [params, setParams] = useSearchParams()
  const site = sites.find((s) => s.id === params.get('site')) ?? sites[0]

  const [model, setModel] = useState<{ siteId: string; url: string; name: string; source: 'local' | 'server' } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<ModelStats | null>(null)
  const [stage, setStage] = useState<ReconStage>('mesh')
  const ar = useArSupport()
  const onStats = useCallback((s: ModelStats) => setStats(s), [])

  // Load the GLB saved for the selected site, if there is one.
  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    setLoading(true)
    setModel(null)
    setStats(null)
    setError(null)
    // A GLB attached in this browser wins; otherwise use the server's reconstruction.
    loadSiteModel(site.id).then(async (saved) => {
      if (cancelled) return
      if (saved) {
        url = URL.createObjectURL(saved.file)
        setModel({ siteId: site.id, url, name: saved.name, source: 'local' })
      } else {
        const serverUrl = await siteModelUrl(site.id)
        if (cancelled) return
        if (serverUrl) setModel({ siteId: site.id, url: serverUrl, name: 'Reconstruction from the DigiHeR server', source: 'server' })
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [site.id])

  async function attach(file: File) {
    if (!/\.(glb|gltf)$/i.test(file.name)) {
      setError(`${file.name} is not a GLB file. Export the reconstruction as .glb and try again.`)
      return
    }
    setError(null)
    setStats(null)
    if (model?.source === 'local') URL.revokeObjectURL(model.url)
    setModel({ siteId: site.id, url: URL.createObjectURL(file), name: file.name, source: 'local' })
    const saved = await saveSiteModel(site.id, file.name, file)
    if (saved === undefined) setError('The model is showing, but this browser blocked saving it, so it will be gone after a reload.')
  }

  async function remove() {
    if (model?.source === 'local') URL.revokeObjectURL(model.url)
    setStats(null)
    await deleteSiteModel(site.id)
    const serverUrl = await siteModelUrl(site.id)
    setModel(serverUrl ? { siteId: site.id, url: serverUrl, name: 'Reconstruction from the DigiHeR server', source: 'server' } : null)
  }

  const hasModel = !!model || !!site.sample

  return (
    <div className="page">
      <h1>Viewer and AR</h1>
      <p className="lede narrow">
        Pick a site to see its model. Drag to orbit and scroll to zoom. On an Android phone with ARCore, place it on a
        real floor or table.
      </p>

      <div className="row wrap gap end">
        <label className="field">
          <span>Site</span>
          <select value={site.id} onChange={(e) => setParams({ site: e.target.value })}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="btn">
          {model ? 'Replace GLB model' : 'Attach GLB model'}
          <input
            type="file"
            accept=".glb,.gltf,model/gltf-binary"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void attach(f)
            }}
          />
        </label>
        {model?.source === 'local' && <button className="btn ghost" onClick={remove}>Remove attached GLB</button>}
        {!model && site.sample && (
          <div className="seg" role="radiogroup" aria-label="Reconstruction stage">
            {(['sparse', 'dense', 'mesh'] as const).map((s) => (
              <button key={s} role="radio" aria-checked={stage === s} className={stage === s ? 'on' : undefined} onClick={() => setStage(s)}>
                {s === 'sparse' ? 'Sparse cloud' : s === 'dense' ? 'Dense cloud' : 'Mesh'}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      {loading ? (
        <div className="viewer-canvas viewer-empty"><p className="muted">Loading {site.name}…</p></div>
      ) : hasModel ? (
        <ModelViewer key={site.id} stage={stage} variant={site.sample ?? 'nagara'} gltfUrl={model?.url} onStats={onStats} className="viewer-canvas">
          {(enterAr) => (
            <div className="viewer-overlay">
              <button className="btn primary" onClick={enterAr} disabled={!ar}>View in AR</button>
              {ar === false && <span className="small">AR needs Chrome on an ARCore Android phone, served over HTTPS.</span>}
            </div>
          )}
        </ModelViewer>
      ) : (
        <div className="viewer-canvas viewer-empty">
          <div>
            <p><strong>{site.name} has no 3D model yet.</strong></p>
            <p className="muted">
              Attach the GLB file produced by the reconstruction, or <Link to={`/sites/${site.id}`}>run the reconstruction</Link> first.
            </p>
          </div>
        </div>
      )}

      <div className="model-info">
        {model ? (
          <>
            <p>
              <strong>{model.name}</strong>
              {model.source === 'local' ? `, saved for ${site.name} in this browser.` : ` for ${site.name}.`}
            </p>
            {stats ? (
              <p>
                {stats.faces.toLocaleString()} faces, {stats.vertices.toLocaleString()} vertices.{' '}
                {stats.faces > FACE_MAX
                  ? `Above the ${FACE_MAX.toLocaleString()}-face mobile budget; decimate it before publishing for AR.`
                  : stats.faces < FACE_MIN
                    ? `Below ${FACE_MIN.toLocaleString()} faces; fine for phones, but fine carvings may be lost.`
                    : 'Within the 50k–200k face budget for real-time AR.'}
              </p>
            ) : (
              <p className="muted">Reading model…</p>
            )}
          </>
        ) : site.sample ? (
          <p className="muted">
            Showing an illustration model for {site.name} ({site.sample === 'dome' ? 'domed hall' : 'Nagara-style temple'}),
            not a real scan. Attach the site's GLB to see the actual reconstruction.
          </p>
        ) : null}
      </div>

      <section className="band">
        <h2>Trying AR on your phone</h2>
        <ol className="plain">
          <li>On the laptop, run <code>npm run dev:https</code> and note the Network address it prints.</li>
          <li>Open that address in Chrome on an Android phone on the same Wi-Fi, and accept the certificate warning.</li>
          <li>Pick a site, tap View in AR, and move the phone slowly over the floor until the ring appears. Tap to place the model.</li>
        </ol>
      </section>
    </div>
  )
}
