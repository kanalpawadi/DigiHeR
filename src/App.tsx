import { useEffect, useState } from 'react'
import { Link, NavLink, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Contribute from './pages/Contribute'
import Sites from './pages/Sites'
import Viewer from './pages/Viewer'
import Dashboard from './pages/Dashboard'
import { useBackend } from './services/api'

const NAV = [
  { to: '/', label: 'Overview' },
  { to: '/contribute', label: 'Contribute' },
  { to: '/sites', label: 'Sites & Pipeline' },
  { to: '/viewer', label: '3D & WebXR Viewer' },
  { to: '/dashboard', label: 'Analytics' },
]

export default function App() {
  const backend = useBackend()
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('digiher_theme') as 'dark' | 'light') || 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('digiher_theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }

  return (
    <div className="shell">
      <div className="ambient-backdrop" aria-hidden="true">
        <div className="glow-sphere glow-1" />
        <div className="glow-sphere glow-2" />
      </div>

      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/" className="wordmark" aria-label="DigiHeR home">
            <span className="logo-glyph">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="url(#cube-grad-1)" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <defs>
                  <linearGradient id="cube-grad-1" x1="2" y1="2" x2="22" y2="12" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#6366F1" />
                    <stop offset="1" stopColor="#06B6D4" />
                  </linearGradient>
                </defs>
              </svg>
            </span>
            <div className="wordmark-text">
              <span className="brand-name">DigiHeR</span>
              <span className="brand-tag">WebXR 3D</span>
            </div>
          </NavLink>

          <nav className="nav" aria-label="Main Navigation">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="topbar-actions">
            {backend !== undefined && (
              <span
                className={`mode-chip${backend ? ' online' : ''}`}
                title={backend ? `IQA: ${backend.iqaModel}. COLMAP ${backend.colmap}. Surface: ${backend.dense}.` : 'Running in browser simulation mode.'}
              >
                <span className="pulse-dot" />
                {backend ? 'Backend Connected' : 'Simulated Pipeline'}
              </span>
            )}

            <button
              type="button"
              className="theme-btn"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>

            <Link to="/viewer" className="btn btn-sm btn-glow">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
              Launch AR
            </Link>
          </div>
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/contribute" element={<Contribute />} />
          <Route path="/sites" element={<Sites />} />
          <Route path="/sites/:siteId" element={<Sites />} />
          <Route path="/viewer" element={<Viewer />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="footer-title">DigiHeR: Scalable Crowdsourced 3D Cultural Heritage</span>
            <p className="footer-desc">
              ICDAM-2026 Paper #731 • Pawadi P. Kanal, Dr. Tanveer I. Bagban and Sanjana S. Teli (DKTE Ichalkaranji).
            </p>
          </div>
          <div className="footer-links">
            <Link to="/contribute">Upload Photos</Link>
            <Link to="/sites">Heritage Sites</Link>
            <Link to="/viewer">WebXR AR Viewer</Link>
            <Link to="/dashboard">Benchmark Data</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
