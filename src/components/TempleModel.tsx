import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js'

export type ReconStage = 'sparse' | 'dense' | 'mesh'

/**
 * A procedural Nagara-style temple (plinth, sanctum, curved shikhara, amalaka,
 * kalasha, pillared mandapa). It stands in for a reconstructed model so the
 * three pipeline outputs can be shown without shipping real scan data:
 * sparse SfM points + camera poses, dense MVS cloud, and the final mesh.
 */

function part(g: THREE.BufferGeometry, x = 0, y = 0, z = 0, rotY = 0) {
  const geo = (g.index ? g.toNonIndexed() : g).clone()
  geo.deleteAttribute('uv')
  geo.rotateY(rotY)
  geo.translate(x, y, z)
  return geo
}

function buildTemple(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  // Stepped plinth (jagati)
  parts.push(part(new THREE.BoxGeometry(3.2, 0.18, 4.2), 0, 0.09, 0.45))
  parts.push(part(new THREE.BoxGeometry(2.9, 0.16, 3.9), 0, 0.26, 0.45))
  // Sanctum (garbhagriha) with offset projections
  parts.push(part(new THREE.BoxGeometry(1.5, 1.0, 1.5), 0, 0.84, -0.35))
  parts.push(part(new THREE.BoxGeometry(0.5, 0.95, 1.7), 0, 0.82, -0.35))
  parts.push(part(new THREE.BoxGeometry(1.7, 0.95, 0.5), 0, 0.82, -0.35))
  // Curved shikhara: lathe profile, 4-sided then a ribbed 16-sided core
  const profile: THREE.Vector2[] = []
  for (let i = 0; i <= 24; i++) {
    const t = i / 24
    const r = 1.02 * (1 - Math.pow(t, 1.6)) + 0.12
    profile.push(new THREE.Vector2(r, t * 2.2))
  }
  parts.push(part(new THREE.LatheGeometry(profile, 4), 0, 1.34, -0.35, Math.PI / 4))
  const core = profile.map((p) => new THREE.Vector2(p.x * 0.86, p.y))
  parts.push(part(new THREE.LatheGeometry(core, 16), 0, 1.34, -0.35))
  // Horizontal bhumi bands on the shikhara
  for (let k = 1; k <= 5; k++) {
    const t = k / 6
    const r = 1.02 * (1 - Math.pow(t, 1.6)) + 0.12
    parts.push(part(new THREE.CylinderGeometry(r * 1.03, r * 1.06, 0.05, 4), 0, 1.34 + t * 2.2, -0.35, Math.PI / 4))
  }
  // Amalaka (ribbed disc) and kalasha (finial)
  const amalaka = new THREE.TorusGeometry(0.2, 0.09, 8, 24)
  amalaka.rotateX(Math.PI / 2)
  parts.push(part(amalaka, 0, 3.6, -0.35))
  parts.push(part(new THREE.SphereGeometry(0.09, 12, 8), 0, 3.74, -0.35))
  parts.push(part(new THREE.ConeGeometry(0.05, 0.22, 10), 0, 3.92, -0.35))
  // Mandapa: floor, pillars, stepped pyramidal roof
  parts.push(part(new THREE.BoxGeometry(1.9, 0.08, 1.6), 0, 0.38, 1.4))
  for (const x of [-0.8, -0.27, 0.27, 0.8]) {
    for (const z of [0.75, 1.4, 2.05]) {
      if (Math.abs(x) < 0.3 && z > 2) continue // entrance
      parts.push(part(new THREE.CylinderGeometry(0.06, 0.07, 0.8, 8), x, 0.82, z))
    }
  }
  parts.push(part(new THREE.BoxGeometry(1.95, 0.1, 1.65), 0, 1.27, 1.4))
  for (let k = 0; k < 4; k++) {
    const s = 1.0 - k * 0.2
    parts.push(part(new THREE.CylinderGeometry(s * 0.92, s * 1.08, 0.16, 4), 0, 1.4 + k * 0.17, 1.4, Math.PI / 4))
  }
  // Entrance steps
  for (let k = 0; k < 3; k++) parts.push(part(new THREE.BoxGeometry(0.7, 0.1, 0.18), 0, 0.05 + k * 0.1, 2.75 - k * 0.15))

  return finish(parts)
}

/** Octagonal domed hall (rangamandapa) on a plinth, as for an interior-dome site. */
function buildDomeHall(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  // Stepped octagonal plinth
  parts.push(part(new THREE.CylinderGeometry(2.3, 2.4, 0.2, 8), 0, 0.1, 0, Math.PI / 8))
  parts.push(part(new THREE.CylinderGeometry(2.05, 2.15, 0.18, 8), 0, 0.29, 0, Math.PI / 8))
  // Ring of pillars with capitals
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const x = Math.cos(a) * 1.75, z = Math.sin(a) * 1.75
    parts.push(part(new THREE.BoxGeometry(0.2, 0.12, 0.2), x, 0.44, z, -a))
    parts.push(part(new THREE.CylinderGeometry(0.08, 0.09, 1.2, 8), x, 1.0, z))
    parts.push(part(new THREE.BoxGeometry(0.26, 0.1, 0.26), x, 1.65, z, -a))
  }
  // Inner sanctum walls
  parts.push(part(new THREE.CylinderGeometry(1.0, 1.0, 1.3, 8, 1, true), 0, 1.03, 0, Math.PI / 8))
  // Entablature, octagonal drum and hemispherical dome
  parts.push(part(new THREE.CylinderGeometry(2.0, 2.0, 0.16, 8), 0, 1.78, 0, Math.PI / 8))
  parts.push(part(new THREE.CylinderGeometry(1.45, 1.6, 0.5, 8), 0, 2.11, 0, Math.PI / 8))
  for (let k = 0; k < 3; k++) {
    parts.push(part(new THREE.CylinderGeometry(1.5 - k * 0.05, 1.5 - k * 0.05, 0.05, 32), 0, 2.4 + k * 0.03, 0))
  }
  parts.push(part(new THREE.SphereGeometry(1.42, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), 0, 2.45, 0))
  // Lotus band and finial
  parts.push(part(new THREE.TorusGeometry(0.28, 0.07, 8, 24).rotateX(Math.PI / 2), 0, 3.84, 0))
  parts.push(part(new THREE.SphereGeometry(0.16, 16, 10), 0, 4.0, 0))
  parts.push(part(new THREE.ConeGeometry(0.06, 0.3, 12), 0, 4.28, 0))
  // Entrance steps
  for (let k = 0; k < 3; k++) parts.push(part(new THREE.BoxGeometry(0.9, 0.1, 0.2), 0, 0.05 + k * 0.1, 2.75 - k * 0.18))
  return finish(parts)
}

function finish(parts: THREE.BufferGeometry[]) {
  const merged = mergeGeometries(parts)!
  merged.computeVertexNormals()
  merged.computeBoundingBox()
  return merged
}

export type TempleVariant = 'nagara' | 'dome'

function samplePoints(geo: THREE.BufferGeometry, count: number, jitter: number, seed: number) {
  let s = seed
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const sampler = new MeshSurfaceSampler(new THREE.Mesh(geo))
  // Seeded so the point cloud looks the same on every load (typings omit this method).
  ;(sampler as unknown as { setRandomGenerator(fn: () => number): void }).setRandomGenerator(rand)
  sampler.build()
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  const p = new THREE.Vector3()
  const base = new THREE.Color('#c8ae86')
  const dark = new THREE.Color('#7d6a52')
  const c = new THREE.Color()
  const top = geo.boundingBox!.max.y
  for (let i = 0; i < count; i++) {
    sampler.sample(p)
    pos[i * 3] = p.x + (rand() - 0.5) * jitter
    pos[i * 3 + 1] = p.y + (rand() - 0.5) * jitter
    pos[i * 3 + 2] = p.z + (rand() - 0.5) * jitter
    c.copy(dark).lerp(base, 0.35 + 0.65 * (p.y / top) * rand() + 0.2 * rand())
    col.set([c.r, c.g, c.b], i * 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

/** Small camera frusta on a ring, as SfM recovers them from crowdsourced photos. */
function buildCameras(count: number) {
  const verts: number[] = []
  const tip = new THREE.Vector3()
  const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  const target = new THREE.Vector3(0, 1.4, 0)
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.sin(i * 7.1) * 0.08
    const r = 4.6 + Math.sin(i * 3.3) * 0.5
    tip.set(Math.cos(a) * r, 1.0 + Math.sin(i * 1.7) * 0.6, Math.sin(a) * r)
    const dir = target.clone().sub(tip).normalize()
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize()
    const up = new THREE.Vector3().crossVectors(right, dir).normalize()
    const center = tip.clone().addScaledVector(dir, 0.32)
    corners[0].copy(center).addScaledVector(right, 0.16).addScaledVector(up, 0.11)
    corners[1].copy(center).addScaledVector(right, -0.16).addScaledVector(up, 0.11)
    corners[2].copy(center).addScaledVector(right, -0.16).addScaledVector(up, -0.11)
    corners[3].copy(center).addScaledVector(right, 0.16).addScaledVector(up, -0.11)
    for (let k = 0; k < 4; k++) {
      verts.push(...tip.toArray(), ...corners[k].toArray())
      verts.push(...corners[k].toArray(), ...corners[(k + 1) % 4].toArray())
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  return g
}

export function TempleModel({ stage, variant = 'nagara' }: { stage: ReconStage; variant?: TempleVariant }) {
  const { mesh, sparse, dense, cams } = useMemo(() => {
    const mesh = variant === 'dome' ? buildDomeHall() : buildTemple()
    return {
      mesh,
      sparse: samplePoints(mesh, 2200, 0.06, 7),
      dense: samplePoints(mesh, 90000, 0.012, 11),
      cams: buildCameras(36),
    }
  }, [variant])

  return (
    <group>
      {stage === 'sparse' && (
        <>
          <points geometry={sparse}>
            <pointsMaterial size={0.045} vertexColors sizeAttenuation />
          </points>
          <lineSegments geometry={cams}>
            <lineBasicMaterial color="#5b60c9" />
          </lineSegments>
        </>
      )}
      {stage === 'dense' && (
        <points geometry={dense}>
          <pointsMaterial size={0.018} vertexColors sizeAttenuation />
        </points>
      )}
      {stage === 'mesh' && (
        <mesh geometry={mesh} castShadow receiveShadow>
          <meshStandardMaterial color="#c4a982" roughness={0.88} metalness={0} flatShading />
        </mesh>
      )}
    </group>
  )
}
