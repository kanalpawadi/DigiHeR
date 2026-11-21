import { useMemo, useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import exifr from 'exifr'
import { useStore } from '../store'
import { assessImage, THRESHOLD, W_A, W_T, MIN_W, MIN_H } from '../lib/iqa'
import type { Submission } from '../lib/types'
import { VerdictBadge } from '../components/Verdict'
import { deleteImage, uploadImage, useBackend } from '../services/api'

export default function Contribute() {
  const sites = useStore((s) => s.sites)
  const addSite = useStore((s) => s.addSite)
  const addSubmission = useStore((s) => s.addSubmission)
  const removeSubmission = useStore((s) => s.removeSubmission)
  const recluster = useStore((s) => s.recluster)
  const [siteId, setSiteId] = useState(sites[0]?.id ?? '')
  const allSubs = useStore((s) => s.submissions)
  const subs = useMemo(() => allSubs.filter((x) => x.siteId === siteId), [allSubs, siteId])
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null)
  const [newSite, setNewSite] = useState('')
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const backend = useBackend()

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files)
    if (!list.length || !siteId) return
    setBusy({ done: 0, total: list.length })
    for (let i = 0; i < list.length; i++) {
      const file = list[i]
      try {
        const [res, gps] = await Promise.all([assessImage(file), exifr.gps(file).catch(() => null)])
        const sub: Submission = {
          id: crypto.randomUUID(),
          siteId,
          fileName: file.name,
          thumbUrl: res.thumbUrl,
          width: res.width,
          height: res.height,
          gps: gps && Number.isFinite(gps.latitude) ? { lat: gps.latitude, lon: gps.longitude } : null,
          scores: res.scores,
          verdict: res.verdict,
          reasons: res.reasons,
          cluster: null,
          createdAt: Date.now(),
        }
        // Photos that pass the on-device format/size check go to the backend,
        // whose quality score is the one that counts for reconstruction.
        if (backend && res.scores) {
          try {
            const server = await uploadImage(siteId, file)
            Object.assign(sub, {
              id: server.id,
              uploaded: true,
              scores: server.scores,
              verdict: server.verdict,
              reasons: server.reasons,
              gps: server.gps ?? sub.gps,
            })
          } catch (e) {
            sub.reasons = [...sub.reasons, `Not sent to the server: ${e instanceof Error ? e.message : 'upload failed'}. Remove it and upload again.`]
          }
        }
        addSubmission(sub)
      } catch {
        addSubmission({
          id: crypto.randomUUID(), siteId, fileName: file.name, thumbUrl: '', width: 0, height: 0, gps: null,
          scores: null, verdict: 'rejected', reasons: ['File could not be read as an image'], cluster: null, createdAt: Date.now(),
        })
      }
      setBusy({ done: i + 1, total: list.length })
    }
    recluster(siteId, 30, 3)
    setBusy(null)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    void handleFiles(e.dataTransfer.files)
  }

  const counts = {
    accepted: subs.filter((s) => s.verdict === 'accepted').length,
    review: subs.filter((s) => s.verdict === 'review').length,
    rejected: subs.filter((s) => s.verdict === 'rejected').length,
  }

  return (
    <div className="page">
      <h1>Contribute photos</h1>
      <p className="lede narrow">
        Photos are checked on your device first. Each one gets a quality score
        S_IQA = {W_T}·Q_T + {W_A}·Q_A. A score of {THRESHOLD} or more is accepted for reconstruction.
      </p>
      {backend === null && (
        <p className="notice">The server isn't running, so photos are only scored in this browser and can't be reconstructed into a real model.</p>
      )}
      {backend && <p className="small muted">Photos that pass the size check are uploaded and scored again on the server.</p>}

      <div className="row wrap gap">
        <label className="field">
          <span>Site</span>
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <form
          className="row gap end"
          onSubmit={(e) => {
            e.preventDefault()
            if (!newSite.trim()) return
            setSiteId(addSite(newSite.trim(), 'Community site'))
            setNewSite('')
          }}
        >
          <label className="field">
            <span>Or add a new site</span>
            <input value={newSite} onChange={(e) => setNewSite(e.target.value)} placeholder="e.g. Kopeshwar Temple" />
          </label>
          <button className="btn" type="submit" disabled={!newSite.trim()}>Add site</button>
        </form>
      </div>

      <div
        className={`dropzone${dragging ? ' over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <p><strong>Drop photos here</strong> or</p>
        <button className="btn primary" onClick={() => input.current?.click()} disabled={!!busy}>Choose photos</button>
        <input ref={input} type="file" accept="image/jpeg,image/png" multiple hidden onChange={(e) => e.target.files && handleFiles(e.target.files)} />
        <p className="muted small">JPEG or PNG with at least {MIN_W}×{MIN_H} pixels' worth of detail (any shape). Photos with GPS are grouped by location. Walk around the structure and keep about 60% overlap between shots.</p>
        <div className="demo-actions">
          <span className="demo-actions-label">No temple photos on hand? Test with AI sample:</span>
          <div className="demo-btns">
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={!!busy}
              onClick={async () => {
                try {
                  const res = await fetch('/images/somanatha-site.jpg')
                  const blob = await res.blob()
                  const file = new File([blob], 'somanatha-sample.jpg', { type: 'image/jpeg' })
                  await handleFiles([file])
                } catch (e) {
                  console.error(e)
                }
              }}
            >
              Test Somanatha Sample
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={!!busy}
              onClick={async () => {
                try {
                  const res = await fetch('/images/gopinatha-dome.jpg')
                  const blob = await res.blob()
                  const file = new File([blob], 'gopinatha-dome-sample.jpg', { type: 'image/jpeg' })
                  await handleFiles([file])
                } catch (e) {
                  console.error(e)
                }
              }}
            >
              Test Gopinatha Dome Sample
            </button>
          </div>
        </div>

        {busy && (
          <div className="progress" role="progressbar" aria-valuenow={busy.done} aria-valuemax={busy.total}>
            <div style={{ width: `${(busy.done / busy.total) * 100}%` }} />
            <span>Checking {busy.done} of {busy.total}</span>
          </div>
        )}
      </div>

      {subs.length > 0 && (
        <>
          <div className="row between wrap gap tally">
            <p>
              <strong>{subs.length}</strong> photos: {counts.accepted} accepted, {counts.review} for review, {counts.rejected} rejected
            </p>
            <Link className="btn" to={`/sites/${siteId}`}>Reconstruct this site</Link>
          </div>
          <ul className="subs">
            {subs.map((s) => (
              <li key={s.id} className="sub">
                {s.thumbUrl ? <img src={s.thumbUrl} alt="" /> : <div className="noimg" />}
                <div className="sub-body">
                  <div className="row between gap">
                    <span className="fname" title={s.fileName}>{s.fileName}</span>
                    <VerdictBadge verdict={s.verdict} />
                  </div>
                  {s.scores && <ScoreBar value={s.scores.s} />}
                  <p className="small muted">
                    {s.width}×{s.height}
                    {s.gps ? `, GPS ${s.gps.lat.toFixed(5)}, ${s.gps.lon.toFixed(5)}` : ', no GPS'}
                    {s.uploaded ? ', on server' : ''}
                  </p>
                  {s.reasons.length > 0 && <ul className="reasons">{s.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
                  {s.scores && (
                    <details>
                      <summary>Score breakdown</summary>
                      <table className="mini">
                        <tbody>
                          <tr><th>Q_T technical</th><td>{s.scores.qT.toFixed(2)}</td><th>Q_A perceptual</th><td>{s.scores.qA.toFixed(2)}</td></tr>
                          <tr><th>Sharpness</th><td>{s.scores.sharpness.toFixed(2)}</td><th>Contrast</th><td>{s.scores.contrast.toFixed(2)}</td></tr>
                          <tr><th>Exposure</th><td>{s.scores.exposure.toFixed(2)}</td><th>Colour</th><td>{s.scores.colorfulness.toFixed(2)}</td></tr>
                          <tr><th>Low noise</th><td>{s.scores.noise.toFixed(2)}</td><th>Dynamic range</th><td>{s.scores.dynamicRange.toFixed(2)}</td></tr>
                          <tr><th>Texture</th><td>{s.scores.texture.toFixed(2)}</td><th /><td /></tr>
                        </tbody>
                      </table>
                    </details>
                  )}
                  <button className="link small" onClick={() => { if (s.uploaded) void deleteImage(s.id); removeSubmission(s.id) }}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function ScoreBar({ value }: { value: number }) {
  return (
    <div className="scorebar" aria-label={`Quality score ${value.toFixed(2)}`}>
      <div className="fill" style={{ width: `${value * 100}%` }} />
      <div className="tick" style={{ left: `${THRESHOLD * 100}%` }} title={`Threshold ${THRESHOLD}`} />
      <span>{value.toFixed(2)}</span>
    </div>
  )
}
