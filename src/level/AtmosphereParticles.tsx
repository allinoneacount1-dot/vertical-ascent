// Single-draw-call ambient wind motes / sunlit pollen / sky stardust (G4/Ghibli atmosphere).
// Reacts to Crosswind Gust telegraph & active gusts (Tahap 2) by thickening/brightening and accelerating laterally.
// Wraps smoothly around the player in a 90x45x90 m volume with zero per-frame allocations.
import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, Points, PointsMaterial, SRGBColorSpace } from 'three'
import { game } from '../game/game.ts'

const COUNT = 260
const SPAN_XZ = 90
const SPAN_Y = 45

const COL_LOW = new Color('#ffe7b0')
const COL_MID = new Color('#eef7ff')
const COL_HIGH = new Color('#ffe699')
const COL_GUST = new Color('#ffffff')
const tmpColor = new Color()

function softMoteTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  if (!g) return null
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,252,240,0.65)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}

export function AtmosphereParticles() {
  const { points, geom, mat, seeds } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3)
    const seeds = new Float32Array(COUNT * 3)
    let s = 1337
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0
      return s / 4294967296
    }
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (rnd() - 0.5) * SPAN_XZ
      positions[i * 3 + 1] = (rnd() - 0.5) * SPAN_Y
      positions[i * 3 + 2] = (rnd() - 0.5) * SPAN_XZ
      seeds[i * 3] = 0.6 + rnd() * 1.4
      seeds[i * 3 + 1] = 0.3 + rnd() * 0.7
      seeds[i * 3 + 2] = rnd() * Math.PI * 2
    }
    const geom = new BufferGeometry()
    geom.setAttribute('position', new BufferAttribute(positions, 3))
    const tex = softMoteTexture()
    const mat = new PointsMaterial({
      map: tex ?? undefined,
      color: COL_LOW,
      size: 0.42,
      transparent: true,
      opacity: 0.55,
      blending: AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      fog: false,
    })
    const points = new Points(geom, mat)
    points.frustumCulled = false
    points.renderOrder = 2
    return { points, geom, mat, seeds }
  }, [])

  useEffect(
    () => () => {
      geom.dispose()
      mat.map?.dispose()
      mat.dispose()
    },
    [geom, mat],
  )

  useFrame((state, dt) => {
    const step = Math.min(dt, 0.05)
    const at = game.port?.position
    const cx = at?.x ?? 0
    const cy = (at?.y ?? 0) + 6
    const cz = at?.z ?? 0
    const hRatio = Math.max(0, Math.min(1, game.level.summitM > 0 ? game.run.heightM / game.level.summitM : 0))
    const gust = game.challenges.windIntensity
    const gustDirX = Math.cos(game.challenges.windAngle)
    const gustDirZ = Math.sin(game.challenges.windAngle)
    const windSpeed = 1.4 + hRatio * 4.2 + gust * 18.0
    const t = state.clock.elapsedTime

    const heightM = at != null ? Math.max(0, at.y - game.spawn.y) : game.run.heightM
    const fireflyBoost = Math.max(0, Math.min(1, (heightM - 380) / 80))
    if (hRatio < 0.5) tmpColor.copy(COL_LOW).lerp(COL_MID, hRatio * 2)
    else tmpColor.copy(COL_MID).lerp(COL_HIGH, (hRatio - 0.5) * 2)
    if (gust > 0.05) tmpColor.lerp(COL_GUST, Math.min(1, gust * 0.85))
    mat.color.copy(tmpColor)
    mat.opacity = Math.min(0.95, 0.42 + hRatio * 0.32 + fireflyBoost * 0.22 + gust * 0.42)
    mat.size = 0.42 + fireflyBoost * 0.26 + gust * 0.48

    const attr = geom.getAttribute('position') as BufferAttribute
    const arr = attr.array as Float32Array
    const halfXZ = SPAN_XZ / 2
    const halfY = SPAN_Y / 2
    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3
      const vx = gust > 0.05 ? gustDirX * windSpeed : windSpeed
      const vz = gust > 0.05 ? gustDirZ * windSpeed : windSpeed * 0.35
      let x = arr[i3] + vx * seeds[i3] * step
      let y = arr[i3 + 1] + (0.25 + Math.sin(t * 0.9 + seeds[i3 + 2]) * 0.35) * seeds[i3 + 1] * step
      let z = arr[i3 + 2] + vz * seeds[i3] * step

      if (x - cx > halfXZ) x -= SPAN_XZ
      else if (x - cx < -halfXZ) x += SPAN_XZ
      if (y - cy > halfY) y -= SPAN_Y
      else if (y - cy < -halfY) y += SPAN_Y
      if (z - cz > halfXZ) z -= SPAN_XZ
      else if (z - cz < -halfXZ) z += SPAN_XZ

      arr[i3] = x
      arr[i3 + 1] = y
      arr[i3 + 2] = z
    }
    attr.needsUpdate = true
  })

  return <primitive object={points} />
}
