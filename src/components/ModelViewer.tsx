import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, ContactShadows, useGLTF } from '@react-three/drei'
import { XR, XRDomOverlay, createXRStore, useXR, useXRHitTest, useXRInputSourceEvent } from '@react-three/xr'
import * as THREE from 'three'
import { TempleModel, type ReconStage, type TempleVariant } from './TempleModel'

/** Real-world height of the model when placed in AR, in metres. */
const AR_HEIGHT = 0.45

export interface ModelStats {
  faces: number
  vertices: number
  height: number
}

export function useArSupport() {
  const [supported, setSupported] = useState<boolean | null>(null)
  useEffect(() => {
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr
    if (!xr) return setSupported(false)
    xr.isSessionSupported('immersive-ar').then(setSupported, () => setSupported(false))
  }, [])
  return supported
}

function GltfModel({ url, onStats }: { url: string; onStats?: (s: ModelStats) => void }) {
  const { scene } = useGLTF(url)
  const normalised = useMemo(() => {
    const root = scene.clone(true)
    const box = new THREE.Box3().setFromObject(root)
    const size = box.getSize(new THREE.Vector3())
    const scale = 3.6 / Math.max(size.x, size.y, size.z || 1)
    const center = box.getCenter(new THREE.Vector3())
    root.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale)
    root.scale.setScalar(scale)
    let faces = 0
    let vertices = 0
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.castShadow = true
      const g = m.geometry
      vertices += g.attributes.position.count
      faces += (g.index ? g.index.count : g.attributes.position.count) / 3
    })
    return { root, stats: { faces: Math.round(faces), vertices, height: size.y } }
  }, [scene])
  useEffect(() => onStats?.(normalised.stats), [normalised, onStats])
  return <primitive object={normalised.root} />
}

type ArStatus = 'scanning' | 'surface' | 'placed'

/**
 * Markerless AR. A ring follows real surfaces found by WebXR hit-testing; a tap
 * (or the Place button) anchors the model there. If no surface is found, the
 * model can be placed in front of the camera instead. Instructions and controls
 * are drawn on top of the camera view through the WebXR DOM overlay.
 */
function ArPlacement({ children }: { children: ReactNode }) {
  const reticle = useRef<THREE.Group>(null)
  const placed = useRef<THREE.Group>(null)
  const camera = useThree((s) => s.camera)
  const session = useXR((s) => s.session)
  const [status, setStatus] = useState<ArStatus>('scanning')
  const [size, setSize] = useState(1)
  const [slow, setSlow] = useState(false)
  const hit = useMemo(() => new THREE.Matrix4(), [])
  const hitPos = useMemo(() => new THREE.Vector3(), [])
  const hasHit = useRef(false)
  const statusRef = useRef(status)
  statusRef.current = status

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 7000)
    return () => clearTimeout(t)
  }, [])

  useXRHitTest((results, getWorldMatrix) => {
    const r = reticle.current
    if (!r) return
    hasHit.current = results.length > 0 && getWorldMatrix(hit, results[0])
    r.visible = hasHit.current && statusRef.current !== 'placed'
    if (hasHit.current) {
      r.matrix.copy(hit)
      hitPos.setFromMatrixPosition(hit)
      if (statusRef.current === 'scanning') setStatus('surface')
    }
  }, 'viewer')

  const faceCamera = (g: THREE.Group) => {
    const cam = new THREE.Vector3()
    camera.getWorldPosition(cam)
    g.rotation.set(0, Math.atan2(cam.x - g.position.x, cam.z - g.position.z), 0)
  }

  const placeOnSurface = () => {
    if (!hasHit.current || !placed.current) return
    placed.current.position.copy(hitPos)
    faceCamera(placed.current)
    setStatus('placed')
  }

  const placeInFront = () => {
    if (!placed.current) return
    const cam = new THREE.Vector3()
    const dir = new THREE.Vector3()
    camera.getWorldPosition(cam)
    camera.getWorldDirection(dir)
    dir.y = 0
    dir.normalize()
    placed.current.position.copy(cam).addScaledVector(dir, 1.2)
    placed.current.position.y = cam.y - 0.6
    faceCamera(placed.current)
    setStatus('placed')
  }

  // A tap on the camera view places the model. Taps on the overlay panel cancel
  // the XR select (beforexrselect), so pressing a button never moves the model.
  useXRInputSourceEvent('all', 'select', () => placeOnSurface(), [])
  const overlay = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = overlay.current
    if (!el) return
    const block = (e: Event) => e.preventDefault()
    el.addEventListener('beforexrselect', block)
    return () => el.removeEventListener('beforexrselect', block)
  }, [])

  const message =
    status === 'placed'
      ? 'Walk around the model to inspect it. Tap a surface to move it.'
      : status === 'surface'
        ? 'Surface found. Tap the screen, or press Place here.'
        : slow
          ? 'Still looking for a surface. Point at a textured floor or table in good light, or place the model in front of you.'
          : 'Point the camera at the floor and move the phone slowly from side to side.'

  return (
    <>
      <group ref={reticle} visible={false} matrixAutoUpdate={false}>
        <mesh rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.1, 0.13, 40]} />
          <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} depthTest={false} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2}>
          <circleGeometry args={[0.015, 16]} />
          <meshBasicMaterial color="#ffffff" depthTest={false} />
        </mesh>
      </group>
      <group ref={placed} visible={status === 'placed'} scale={(AR_HEIGHT / 4) * size}>
        {children}
      </group>
      <XRDomOverlay
        ref={overlay}
        style={{ position: 'absolute', inset: 'auto 0 0 0', padding: '16px', font: '15px system-ui, sans-serif', color: '#fff' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ background: 'rgba(16,24,23,0.82)', borderRadius: 12, padding: '12px 14px', maxWidth: 480, margin: '0 auto' }}>
          <p style={{ margin: '0 0 10px', lineHeight: 1.4 }}>{message}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {status === 'surface' && <ArButton primary onClick={placeOnSurface}>Place here</ArButton>}
            {status !== 'placed' && <ArButton primary={status === 'scanning'} onClick={placeInFront}>Place in front of me</ArButton>}
            {status === 'placed' && (
              <>
                <ArButton onClick={() => setSize((s) => Math.max(0.25, s / 1.5))}>Smaller</ArButton>
                <ArButton onClick={() => setSize((s) => Math.min(8, s * 1.5))}>Larger</ArButton>
                <ArButton onClick={() => placed.current && (placed.current.rotation.y += Math.PI / 4)}>Rotate</ArButton>
              </>
            )}
            <ArButton onClick={() => void session?.end()}>Exit AR</ArButton>
          </div>
        </div>
      </XRDomOverlay>
    </>
  )
}

function ArButton({ children, onClick, primary }: { children: ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        font: '600 15px system-ui, sans-serif', padding: '10px 14px', borderRadius: 8, minHeight: 44,
        border: primary ? '0' : '1px solid rgba(255,255,255,0.6)',
        background: primary ? '#a5a9f2' : 'transparent', color: primary ? '#141634' : '#fff',
      }}
    >
      {children}
    </button>
  )
}

function Scene({ model, zoom }: { model: ReactNode; zoom: boolean }) {
  const mode = useXR((s) => s.mode)
  const inAr = mode === 'immersive-ar'
  return (
    <>
      <hemisphereLight args={['#f4f6ff', '#6b5a44', 1.1]} />
      <directionalLight position={[5, 8, 4]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} />
      {inAr ? (
        <ArPlacement>{model}</ArPlacement>
      ) : (
        <>
          {model}
          <ContactShadows position={[0, 0, 0]} opacity={0.45} scale={12} blur={2.4} far={5} />
          <OrbitControls makeDefault enableDamping enableZoom={zoom} target={[0, 1.4, 0]} minDistance={2} maxDistance={18} />
        </>
      )}
    </>
  )
}

export interface ModelViewerProps {
  stage?: ReconStage
  /** Which built-in illustration model to show when no GLB is given. */
  variant?: TempleVariant
  gltfUrl?: string | null
  onStats?: (s: ModelStats) => void
  /** Wheel zoom; off where the canvas sits in a scrolling page so scrolling still works. */
  zoom?: boolean
  className?: string
  children?: (enterAr: () => void) => ReactNode
}

export function ModelViewer({ stage = 'mesh', variant = 'nagara', gltfUrl, onStats, zoom = true, className, children }: ModelViewerProps) {
  const store = useMemo(
    () => createXRStore({ hitTest: true, domOverlay: true, emulate: false, controller: false, hand: false }),
    [],
  )
  const model = gltfUrl ? <GltfModel key={gltfUrl} url={gltfUrl} onStats={onStats} /> : <TempleModel stage={stage} variant={variant} />
  return (
    <div className={className} style={{ position: 'relative' }}>
      <Canvas shadows dpr={[1, 2]} camera={{ position: [5.2, 3.6, 6.4], fov: 42 }} gl={{ antialias: true }}>
        <XR store={store}>
          <Suspense fallback={null}>
            <Scene model={model} zoom={zoom} />
          </Suspense>
        </XR>
      </Canvas>
      {children?.(() => void store.enterAR())}
    </div>
  )
}
