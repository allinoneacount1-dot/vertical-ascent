// Fake summit and real summit (ref/03 §Puncak palsu, ref/05 §Prosedural): the fake-summit sensor, the two beacons
// (emissive beam + glow + light; the fake one lit until the reveal, the real one after it) and the text of the
// original sign. The 3D subtree never subscribes to the UI store (D-005): beacons read it with getState() per frame.
// Toggling uses visibility and intensities only, so the light count and the shader programs never change.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
} from 'three'
import { BvhPhysicsSensor } from '@react-three/viverse'
import type { LoadedLevel } from './levels.ts'
import type { PlatformEntry } from './schema.ts'
import { colliderSize, localPieces } from './procedural.ts'
import { game } from '../game/game.ts'
import { useUi } from '../game/store.ts'
import { t } from '../ui/strings.ts'

const ROTATION_ORDER = 'YXZ'
/** Beam and glow sizes: the fake beacon must read as ≥8 px from the spawn ~480 m away at 1920×1080 (TEST-37). */
const BEAM_HEIGHT = 160
const BEAM_RADIUS = 2.4
const GLOW_SCALE = 26
const LIGHT_INTENSITY = 600
const BEACON_COLOR = '#ffd36a'

function glowTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,248,220,1)')
  grad.addColorStop(0.25, 'rgba(255,214,110,0.85)')
  grad.addColorStop(1, 'rgba(255,190,80,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}

/** One beacon: the prefab's post and lamp (own materials, not merged) plus a beam, a glow sprite and a point light. */
function Beacon({ entry, level }: { entry: PlatformEntry; level: LoadedLevel }) {
  const parts = useMemo(() => {
    const prefab = level.prefabs.get(entry.prefab)!
    const root = new Group()
    root.name = `beacon:${entry.beacon}`
    const lamps: MeshStandardMaterial[] = []
    for (const p of localPieces(prefab)) {
      const m = new MeshStandardMaterial({ color: p.color, roughness: p.roughness, metalness: p.metalness })
      if (p.emissive) {
        m.emissive.set(p.emissive)
        lamps.push(m)
      }
      root.add(new Mesh(p.geometry, m))
    }
    const beamMat = new MeshBasicMaterial({ color: BEACON_COLOR, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, fog: false, side: DoubleSide })
    const beam = new Mesh(new CylinderGeometry(BEAM_RADIUS * 0.7, BEAM_RADIUS, BEAM_HEIGHT, 20, 1, true), beamMat)
    beam.position.y = 4 + BEAM_HEIGHT / 2
    beam.renderOrder = 2
    const glowMat = new SpriteMaterial({ map: glowTexture(), color: '#ffffff', blending: AdditiveBlending, depthWrite: false, fog: false, transparent: true })
    const glow = new Sprite(glowMat)
    glow.scale.setScalar(GLOW_SCALE)
    glow.position.y = 3.6
    glow.renderOrder = 2
    const light = new PointLight(BEACON_COLOR, 0, 60, 2)
    light.position.y = 4
    root.add(beam, glow, light)
    return { root, lamps, beam, glow, light, beamMat, glowMat }
  }, [entry, level])

  useEffect(
    () => () => {
      parts.root.traverse((o) => {
        const m = o as Mesh
        if (m.isMesh) {
          m.geometry.dispose()
          ;(m.material as MeshBasicMaterial).dispose()
        }
      })
      parts.glowMat.map?.dispose()
      parts.glowMat.dispose()
    },
    [parts],
  )

  const lit = useRef<boolean | null>(null)
  useFrame(() => {
    const revealed = useUi.getState().summitRevealed
    const on = entry.beacon === 'true' ? revealed : !revealed
    if (on === lit.current) return
    lit.current = on
    parts.beam.visible = on
    parts.glow.visible = on
    parts.light.intensity = on ? LIGHT_INTENSITY : 0
    for (const m of parts.lamps) m.emissiveIntensity = on ? 2 : 0
    game.log('beacon', { beacon: entry.beacon, lit: on })
  })

  return <primitive object={parts.root} position={entry.pos} rotation={[0, entry.rotY, 0, ROTATION_ORDER]} />
}

/** Text of the original sign on the fake summit, both faces of its board (no "Winner", ref/03). */
function SignText({ entry }: { entry: PlatformEntry }) {
  const { canvas, tex, front, back } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 410
    const tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    tex.anisotropy = 4
    const mat = new MeshBasicMaterial({ map: tex, transparent: true })
    const geo = new PlaneGeometry(3.8, 1.52)
    const front = new Mesh(geo, mat)
    front.position.set(0, 2.6, 0.081)
    const back = new Mesh(geo, mat)
    back.position.set(0, 2.6, -0.081)
    back.rotation.y = Math.PI
    return { canvas, tex, front, back }
  }, [])
  const drawn = useRef('')
  const draw = () => {
    const title = t('fakeSignTitle')
    const body = t('fakeSignBody')
    const g = canvas.getContext('2d')!
    g.clearRect(0, 0, canvas.width, canvas.height)
    g.fillStyle = '#1f2a36'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = '700 150px "Inter Variable", system-ui, sans-serif'
    g.fillText(title, 512, 150)
    g.font = '500 58px "Inter Variable", system-ui, sans-serif'
    g.fillText(body, 512, 300, 960)
    tex.needsUpdate = true
    drawn.current = title + body
  }
  useEffect(() => {
    let alive = true
    draw()
    document.fonts?.load('700 150px "Inter Variable"').then(() => alive && draw(), () => undefined)
    return () => {
      alive = false
      tex.dispose()
      front.geometry.dispose()
      ;(front.material as MeshBasicMaterial).dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useFrame(() => {
    // language changes in Settings redraw the sign
    if (drawn.current !== t('fakeSignTitle') + t('fakeSignBody')) draw()
  })
  return (
    <group position={entry.pos} rotation={[0, entry.rotY, 0, ROTATION_ORDER]}>
      <primitive object={front} />
      <primitive object={back} />
    </group>
  )
}

/** Sensor over the fake-summit plateau: collider box 0.1 m wider, top +0.3 m (as the finish sensor). */
function FakeSummitSensor({ entry, level }: { entry: PlatformEntry; level: LoadedLevel }) {
  const prefab = level.prefabs.get(entry.prefab)
  if (prefab?.collider == null) return null
  const [w, h, d] = colliderSize(prefab)
  const o = prefab.collider.offset
  const c: [number, number, number] = [entry.pos[0] + o[0] * prefab.scale, entry.pos[1] + o[1] * prefab.scale, entry.pos[2] + o[2] * prefab.scale]
  return (
    <BvhPhysicsSensor onIntersectedChanged={(inside) => game.setInFakeSummit(inside)}>
      <mesh position={[c[0], c[1] + 0.15, c[2]]} rotation={[0, entry.rotY, 0, ROTATION_ORDER]}>
        <boxGeometry args={[w + 0.1, h + 0.3, d + 0.1]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </BvhPhysicsSensor>
  )
}

export function SummitFeatures({ level }: { level: LoadedLevel }) {
  const entries = level.data.platforms
  const fake = entries.find((e) => e.fakeSummit)
  return (
    <>
      {fake && <FakeSummitSensor entry={fake} level={level} />}
      {entries
        .filter((e) => e.beacon != null)
        .map((e) => (
          <Beacon key={e.id} entry={e} level={level} />
        ))}
      {entries
        .filter((e) => e.prefab === 'fake-sign')
        .map((e) => (
          <SignText key={e.id} entry={e} />
        ))}
    </>
  )
}
