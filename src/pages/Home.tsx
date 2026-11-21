import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ModelViewer } from '../components/ModelViewer'
import type { ReconStage } from '../components/TempleModel'

const STAGES: Array<{ id: ReconStage; label: string; badge: string; note: string }> = [
  {
    id: 'sparse',
    label: 'Sparse Cloud',
    badge: 'COLMAP SfM',
    note: 'Structure-from-Motion estimates where each tourist stood (blue camera frustums) and triangulates sparse tie points.',
  },
  {
    id: 'dense',
    label: 'Dense Cloud',
    badge: 'OpenMVS Stereo',
    note: 'Multi-View Stereo generates depth maps per pixel, producing hundreds of thousands of textured surface points.',
  },
  {
    id: 'mesh',
    label: 'Polygonal Mesh',
    badge: 'WebXR Optimized',
    note: 'Point clouds are triangulated into a clean watertight mesh, decimated to 50k–200k faces for 60 FPS mobile WebXR AR.',
  },
]

const STEPS = [
  {
    step: '01',
    title: 'Crowdsourced Capture',
    desc: 'Visitors capture overlapping smartphone photos (JPEG/PNG, min. 1024×768) covering architectural relief and spires.',
  },
  {
    step: '02',
    title: 'Spatial GPS Clustering',
    desc: 'DBSCAN clusters photos by geographical location, filtering out stray shots and unrelated monuments automatically.',
  },
  {
    step: '03',
    title: 'AI Quality Validation',
    desc: 'Edge AI computes S_IQA = 0.7·Q_T + 0.3·Q_A. Blurry or poorly lit photos are discarded before consuming costly GPU hours.',
  },
  {
    step: '04',
    title: 'Scalable Photogrammetry',
    desc: 'COLMAP and OpenMVS run in orchestrated cloud containers to reconstruct high-fidelity sparse and dense 3D geometry.',
  },
  {
    step: '05',
    title: 'WebXR & AR Exploration',
    desc: 'Decimated GLB models load in any modern browser and anchor to physical floors via WebXR hit-testing.',
  },
]

export default function Home() {
  const [stage, setStage] = useState<ReconStage>('sparse')
  const current = STAGES.find((s) => s.id === stage)!

  return (
    <div className="home-container">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-copy">
          <div className="badge-pill">
            <span className="pulse-beacon" />
            <span>AI-Powered WebXR Photogrammetry • ICDAM-2026 Paper #731</span>
          </div>

          <h1 className="hero-title">
            From Phone Photos to <span className="gradient-text">Sub-Millimeter 3D Heritage</span> Digital Twins.
          </h1>

          <p className="hero-lede">
            DigiHeR turns crowdsourced photographs of historic monuments into 3D models accurate to <strong>4.6–5.9 mm</strong>,
            filters low-quality shots with AI on-device before GPU processing, and lets anyone explore the results in
            browser-based <strong>WebXR Augmented Reality</strong>.
          </p>

          <div className="hero-actions">
            <Link className="btn btn-primary btn-lg" to="/viewer">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
              Explore 3D & AR Viewer
            </Link>
            <Link className="btn btn-secondary btn-lg" to="/contribute">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Contribute Photos
            </Link>
            <Link className="btn btn-ghost btn-lg" to="/sites">
              Browse Sites
            </Link>
          </div>

          <div className="hero-stats-row">
            <div className="stat-pill">
              <span className="stat-pill-val">~5 mm</span>
              <span className="stat-pill-lbl">RMSE vs. LiDAR</span>
            </div>
            <div className="stat-pill">
              <span className="stat-pill-val">-85%</span>
              <span className="stat-pill-lbl">Lower Survey Cost</span>
            </div>
            <div className="stat-pill">
              <span className="stat-pill-val">&gt;96%</span>
              <span className="stat-pill-lbl">Reconstruction Success</span>
            </div>
          </div>
        </div>

        <div className="hero-stage">
          <div className="stage-card">
            <div className="stage-header">
              <div className="stage-header-title">
                <span className="live-dot" />
                <span>Interactive 3D Procedural Reconstructor</span>
              </div>
              <span className="badge-tech">{current.badge}</span>
            </div>

            <div className="stage-canvas-wrap">
              <ModelViewer stage={stage} zoom={false} className="hero-canvas" />
              <div className="stage-telemetry">
                <span>Drag to Orbit • Pinch to Zoom</span>
                <span className="telemetry-badge">WebGL / Three.js</span>
              </div>
            </div>

            <div className="stage-controls">
              <div className="stage-switch" role="tablist" aria-label="Reconstruction stage">
                {STAGES.map((s) => (
                  <button
                    key={s.id}
                    role="tab"
                    aria-selected={stage === s.id}
                    className={`stage-tab ${stage === s.id ? 'active' : ''}`}
                    onClick={() => setStage(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="stage-note">
                <strong>{current.label}:</strong> {current.note}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* AI Pipeline & Visual Showcase with AI Generated Images */}
      <section className="section-container">
        <div className="section-header">
          <span className="section-eyebrow">Visual Architecture</span>
          <h2 className="section-title">AI & WebXR Preservation in Action</h2>
          <p className="section-subtitle">
            How crowdsourced smart devices and edge computer vision replace expensive multi-million dollar LiDAR surveys.
          </p>
        </div>

        <div className="showcase-grid">
          <div className="showcase-card showcase-featured">
            <div className="showcase-image-wrap">
              <img
                src="/images/hero-banner.jpg"
                alt="Ancient temple façade transitioning into a glowing digital twin 3D point cloud"
                className="showcase-img"
                loading="lazy"
              />
              <div className="showcase-gradient-overlay" />
              <div className="showcase-floating-badge">
                <span className="pulse-beacon" /> Digital Twin Photogrammetry
              </div>
            </div>
            <div className="showcase-body">
              <span className="showcase-tag">Dual-Layer Reconstruction</span>
              <h3>From Real Sandstone to Watertight 3D Mesh</h3>
              <p>
                DigiHeR fuses Structure-from-Motion (COLMAP) with Multi-View Stereo (OpenMVS) to recover sub-millimeter
                stone relief. Intricate carvings, pillars, and spires are preserved with high geometric fidelity.
              </p>
              <div className="showcase-meta">
                <span>Accuracy: <strong>4.6–5.9 mm RMSE</strong></span>
                <span>Faces: <strong>Up to 1.8M faces</strong></span>
              </div>
            </div>
          </div>

          <div className="showcase-card">
            <div className="showcase-image-wrap">
              <img
                src="/images/ar-scanning-preview.jpg"
                alt="Smartphone running augmented reality spatial scanning of temple sculpture"
                className="showcase-img"
                loading="lazy"
              />
              <div className="showcase-gradient-overlay" />
              <div className="showcase-floating-badge">WebXR Spatial Computing</div>
            </div>
            <div className="showcase-body">
              <span className="showcase-tag">Real-Time AR Deployment</span>
              <h3>Markerless AR on Mobile Devices</h3>
              <p>
                Using standard WebXR Device APIs and ARCore surface hit-testing, users place full-scale or tabletop
                architectural models in their living room or museum floor with a 92% first-tap placement success rate.
              </p>
              <Link to="/viewer" className="card-link">
                Launch AR Experience &rarr;
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Verified Sites Showcase */}
      <section className="section-container">
        <div className="section-header">
          <span className="section-eyebrow">Case Studies</span>
          <h2 className="section-title">Experimental Sites & Datasets</h2>
          <p className="section-subtitle">
            Evaluated in the ICDAM-2026 research against terrestrial laser scanning (TLS) ground truth.
          </p>
        </div>

        <div className="sites-grid">
          <div className="site-card">
            <div className="site-card-media">
              <img
                src="/images/somanatha-site.jpg"
                alt="Somanatha Temple Façade"
                className="site-card-img"
                loading="lazy"
              />
              <span className="site-card-type">Façade & Shikhara</span>
            </div>
            <div className="site-card-content">
              <h3>Somanatha Temple</h3>
              <p className="site-place">Veraval, Gujarat, India</p>
              <p className="site-desc">
                Nagara-style Hindu temple exterior with intricate stepped carvings, ornamental plinths, and high relief
                sandstone pillars.
              </p>
              <div className="site-metrics">
                <div>
                  <span className="metric-val">1,512</span>
                  <span className="metric-lbl">Raw Photos</span>
                </div>
                <div>
                  <span className="metric-val">98.7%</span>
                  <span className="metric-lbl">SfM Match</span>
                </div>
                <div>
                  <span className="metric-val">4.6 mm</span>
                  <span className="metric-lbl">Laser RMSE</span>
                </div>
              </div>
              <div className="site-card-actions">
                <Link to="/viewer?site=somanatha" className="btn btn-sm btn-primary">
                  View 3D Model
                </Link>
                <Link to="/sites/somanatha" className="btn btn-sm btn-ghost">
                  Pipeline Stats
                </Link>
              </div>
            </div>
          </div>

          <div className="site-card">
            <div className="site-card-media">
              <img
                src="/images/gopinatha-dome.jpg"
                alt="Gopinatha Temple Interior Dome"
                className="site-card-img"
                loading="lazy"
              />
              <span className="site-card-type">Interior Vaulted Dome</span>
            </div>
            <div className="site-card-content">
              <h3>Gopinatha Temple</h3>
              <p className="site-place">Kolhapur Region, India</p>
              <p className="site-desc">
                Concentric stone mandala dome with intricate floral rosettes, challenging variable ambient light, and
                shadow occlusions.
              </p>
              <div className="site-metrics">
                <div>
                  <span className="metric-val">968</span>
                  <span className="metric-lbl">Raw Photos</span>
                </div>
                <div>
                  <span className="metric-val">96.2%</span>
                  <span className="metric-lbl">SfM Match</span>
                </div>
                <div>
                  <span className="metric-val">5.9 mm</span>
                  <span className="metric-lbl">Laser RMSE</span>
                </div>
              </div>
              <div className="site-card-actions">
                <Link to="/viewer?site=gopinatha" className="btn btn-sm btn-primary">
                  View Dome 3D
                </Link>
                <Link to="/sites/gopinatha" className="btn btn-sm btn-ghost">
                  Pipeline Stats
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Step by Step Process */}
      <section className="section-container">
        <div className="section-header">
          <span className="section-eyebrow">Methodology</span>
          <h2 className="section-title">How DigiHeR Digitizes Heritage</h2>
          <p className="section-subtitle">
            A 5-step automated pipeline bridging crowdsourced citizen science with industrial precision.
          </p>
        </div>

        <div className="steps-cards">
          {STEPS.map((s) => (
            <div key={s.step} className="step-card">
              <div className="step-num">{s.step}</div>
              <h3 className="step-title">{s.title}</h3>
              <p className="step-desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Figures & Benchmark */}
      <section className="section-container figures-section">
        <div className="section-header">
          <span className="section-eyebrow">Empirical Results</span>
          <h2 className="section-title">Validated Research Benchmarks</h2>
          <p className="section-subtitle">
            Measured against terrestrial laser scanning on 2,480 crowdsourced photos.
          </p>
        </div>

        <div className="figures-grid">
          <div className="fig-card">
            <span className="fig-metric">4.6–5.9 mm</span>
            <span className="fig-label">Mean Error vs. Laser Scan</span>
            <p className="fig-sub">Sub-6 mm surface deviation verified against terrestrial LiDAR.</p>
          </div>
          <div className="fig-card">
            <span className="fig-metric">25–30%</span>
            <span className="fig-label">Poor Photos Filtered</span>
            <p className="fig-sub">AI IQA drops blurry & poorly lit photos before cloud computation.</p>
          </div>
          <div className="fig-card">
            <span className="fig-metric">&gt; 96%</span>
            <span className="fig-label">SfM Orientation Success</span>
            <p className="fig-sub">High registration rate even across varied tourist smartphone models.</p>
          </div>
          <div className="fig-card">
            <span className="fig-metric">85% Lower</span>
            <span className="fig-label">Total Survey Cost</span>
            <p className="fig-sub">Replaces expensive LiDAR crews with crowdsourced visitor photos.</p>
          </div>
          <div className="fig-card">
            <span className="fig-metric">92%</span>
            <span className="fig-label">AR Placement Success</span>
            <p className="fig-sub">Instant WebXR floor hit-testing with zero specialized hardware.</p>
          </div>
        </div>

        <div className="figures-footer">
          <p>
            Full dataset available in the analytics panel.{' '}
            <Link to="/dashboard" className="text-link">
              View comparative research tables &rarr;
            </Link>
          </p>
        </div>
      </section>
    </div>
  )
}
