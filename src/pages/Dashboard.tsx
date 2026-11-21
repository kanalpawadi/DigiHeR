import { useStore } from '../store'
import { RmseChart } from '../components/RmseChart'
import { VerdictBadge } from '../components/Verdict'

const COMPARE: Array<[string, string, string, string, string]> = [
  ['Cost', 'Very high', 'High', 'Moderate to high', 'Over 85% lower'],
  ['Scalability', 'Low', 'Low', 'Low', 'High'],
  ['Who collects data', 'Experts', 'Experts', 'Experts', 'Anyone'],
  ['Automated quality check', 'None', 'Partial', 'None', 'AI-based IQA'],
  ['Error (RMSE)', 'Sub-mm', '~3–5 mm', '~2–4 mm', '4.6–5.9 mm'],
  ['AR / VR access', 'No', 'No', 'Limited', 'Yes, WebXR'],
  ['Hardware needed', 'LiDAR scanner', 'Pro camera, workstation', 'GPU cluster', 'Smartphone'],
  ['Runs in a browser', 'No', 'No', 'No', 'Yes'],
]

export default function Dashboard() {
  const sites = useStore((s) => s.sites)
  const subs = useStore((s) => s.submissions)
  const resolve = useStore((s) => s.resolveReview)
  const reported = sites.filter((s) => s.reported)
  const queue = subs.filter((s) => s.verdict === 'review')
  const scored = subs.filter((s) => s.scores)
  const accepted = subs.filter((s) => s.verdict === 'accepted').length
  const rejectedPct = subs.length ? Math.round(((subs.length - accepted - queue.length) / subs.length) * 100) : null

  return (
    <div className="page">
      <h1>Dashboard</h1>

      <h2>Photos checked in this browser</h2>
      {subs.length === 0 ? (
        <p className="empty">No photos yet. Upload some on the Contribute page to see acceptance rates here.</p>
      ) : (
        <dl className="figs compact">
          <div><dt>Photos checked</dt><dd>{subs.length}</dd></div>
          <div><dt>Accepted</dt><dd>{accepted}</dd></div>
          <div><dt>Awaiting review</dt><dd>{queue.length}</dd></div>
          <div><dt>Rejected</dt><dd>{rejectedPct}%</dd></div>
          <div><dt>Mean S_IQA</dt><dd>{scored.length ? (scored.reduce((a, s) => a + s.scores!.s, 0) / scored.length).toFixed(2) : '–'}</dd></div>
        </dl>
      )}

      <h2>Review queue</h2>
      {queue.length === 0 ? (
        <p className="empty">Nothing to review. Photos scoring between 0.55 and 0.65 land here for a person to decide.</p>
      ) : (
        <ul className="subs">
          {queue.map((s) => (
            <li key={s.id} className="sub">
              <img src={s.thumbUrl} alt="" />
              <div className="sub-body">
                <div className="row between gap">
                  <span className="fname">{s.fileName}</span>
                  <VerdictBadge verdict={s.verdict} />
                </div>
                <p className="small">Score {s.scores?.s.toFixed(2)}. {s.reasons.join('. ')}.</p>
                <div className="row gap">
                  <button className="btn small" onClick={() => resolve(s.id, 'accepted')}>Accept photo</button>
                  <button className="btn small ghost" onClick={() => resolve(s.id, 'rejected')}>Reject photo</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2>Results reported in the paper</h2>
      <div className="two">
        <div>
          <h3>Reconstruction error against laser scan</h3>
          <RmseChart rows={reported.map((s) => ({ site: s.name.replace(' Temple', ''), tls: s.reported!.tlsRmseMm, digiher: s.reported!.rmseMm }))} />
        </div>
        <div>
          <h3>AI validation by site</h3>
          <table className="data">
            <thead>
              <tr><th>Site</th><th className="num">Photos</th><th className="num">Rejected</th><th className="num">SfM success</th><th className="num">Faces</th></tr>
            </thead>
            <tbody>
              {reported.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td className="num">{s.reported!.rawImages.toLocaleString()}</td>
                  <td className="num">{s.reported!.rejectedPct}%</td>
                  <td className="num">{s.reported!.sfmSuccessPct}%</td>
                  <td className="num">{(s.reported!.meshFaces / 1e6).toFixed(1)}M</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted">Cost reduction factor above 6.5 (under 15% of expert cost). Processing about 40% faster. AR placement succeeded in 92% of sessions.</p>
        </div>
      </div>

      <h2>How DigiHeR compares</h2>
      <div className="scroll-x">
        <table className="data compare">
          <thead>
            <tr><th /><th>Laser scanning</th><th>Expert photogrammetry</th><th>NeRF / Gaussian splatting</th><th>DigiHeR</th></tr>
          </thead>
          <tbody>
            {COMPARE.map(([k, ...v]) => (
              <tr key={k}><th scope="row">{k}</th>{v.map((x, i) => <td key={i} className={i === 3 ? 'ours' : undefined}>{x}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
