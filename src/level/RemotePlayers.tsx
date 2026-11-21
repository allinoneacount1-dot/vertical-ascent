// Remote Multiplayer Climbers (Fase 5):
// Non-collider, smoothly interpolated Ghibli climber avatars + floating nametags for up to 8 WebRTC P2P peers.
// Zero extra draw calls when solo (all slots stay hidden when no peers are connected).
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  SpriteMaterial,
  TorusGeometry,
} from 'three'
import { getHeroSpec } from '../character/heroes.ts'
import type { HeroId } from '../character/heroes.ts'
import { game } from '../game/game.ts'

const MAX_REMOTE_PEERS = 8

type SlotState = {
  peerId: string | null
  labelKey: string
  heroId: HeroId
  initialized: boolean
  x: number
  y: number
  z: number
  yaw: number
}

function drawNametag(
  canvas: HTMLCanvasElement,
  texture: CanvasTexture,
  name: string,
  heightM: number,
  accentHex: string,
  emote: string | null,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)

  const r = 16
  ctx.fillStyle = 'rgba(14, 19, 27, 0.82)'
  ctx.beginPath()
  ctx.moveTo(r, 4)
  ctx.lineTo(w - r, 4)
  ctx.quadraticCurveTo(w - 4, 4, w - 4, r)
  ctx.lineTo(w - 4, h - r)
  ctx.quadraticCurveTo(w - 4, h - 4, w - r, h - 4)
  ctx.lineTo(r, h - 4)
  ctx.quadraticCurveTo(4, h - 4, 4, h - r)
  ctx.lineTo(4, r)
  ctx.quadraticCurveTo(4, 4, r, 4)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = accentHex
  ctx.lineWidth = 3
  ctx.stroke()

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 26px Inter, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(emote ? `${emote} ${name} · ${heightM}m` : `${name} · ${heightM}m`, w / 2, h / 2 + 1, w - 24)
  texture.needsUpdate = true
}

function angleLerp(cur: number, target: number, alpha: number): number {
  const diff = Math.atan2(Math.sin(target - cur), Math.cos(target - cur))
  return cur + diff * alpha
}

const tmpColor = new Color()

export function RemotePlayers() {
  const rootRef = useRef<Group>(null)
  const slotRefs = useRef<Array<Group | null>>([])

  const shared = useMemo(() => {
    const bodyGeo = new CapsuleGeometry(0.27, 0.92, 6, 12)
    const headGeo = new SphereGeometry(0.24, 12, 10)
    const packGeo = new BoxGeometry(0.36, 0.48, 0.22)
    const ringGeo = new TorusGeometry(0.42, 0.035, 8, 20)
    ringGeo.rotateX(Math.PI / 2)

    const headMat = new MeshStandardMaterial({ color: '#fde8d7', roughness: 0.75 })
    const slots = Array.from({ length: MAX_REMOTE_PEERS }, () => {
      const canvas = document.createElement('canvas')
      canvas.width = 320
      canvas.height = 68
      const texture = new CanvasTexture(canvas)
      return {
        bodyMat: new MeshStandardMaterial({ color: '#d8b56a', roughness: 0.55 }),
        packMat: new MeshStandardMaterial({ color: '#4b3a2c', roughness: 0.7 }),
        ringMat: new MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.75 }),
        spriteMat: new SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
        canvas,
        texture,
      }
    })
    return { bodyGeo, headGeo, packGeo, ringGeo, headMat, slots }
  }, [])

  const statesRef = useRef<SlotState[]>(
    Array.from({ length: MAX_REMOTE_PEERS }, () => ({
      peerId: null,
      labelKey: '',
      heroId: 'sora',
      initialized: false,
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
    })),
  )

  useEffect(
    () => () => {
      shared.bodyGeo.dispose()
      shared.headGeo.dispose()
      shared.packGeo.dispose()
      shared.ringGeo.dispose()
      shared.headMat.dispose()
      for (const s of shared.slots) {
        s.bodyMat.dispose()
        s.packMat.dispose()
        s.ringMat.dispose()
        s.spriteMat.dispose()
        s.texture.dispose()
      }
    },
    [shared],
  )

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const alpha = 1 - Math.exp(-14 * dt)
    const peers = Array.from(game.multiplayer.peers.values())
    const states = statesRef.current

    for (let i = 0; i < MAX_REMOTE_PEERS; i++) {
      const g = slotRefs.current[i]
      if (!g) continue
      const peer = peers[i]
      const st = states[i]
      const matSlot = shared.slots[i]

      if (!peer) {
        g.visible = false
        st.peerId = null
        st.initialized = false
        continue
      }

      if (st.peerId !== peer.id || !st.initialized) {
        st.peerId = peer.id
        st.x = peer.x
        st.y = peer.y
        st.z = peer.z
        st.yaw = peer.yaw
        st.initialized = true
      } else {
        st.x += (peer.x - st.x) * alpha
        st.y += (peer.y - st.y) * alpha
        st.z += (peer.z - st.z) * alpha
        st.yaw = angleLerp(st.yaw, peer.yaw, alpha)
      }

      const hero = getHeroSpec(peer.heroId)
      if (st.heroId !== peer.heroId) {
        st.heroId = peer.heroId
        matSlot.bodyMat.color.copy(tmpColor.set(hero.swatch))
        matSlot.packMat.color.copy(tmpColor.set(hero.packBody))
        matSlot.ringMat.color.copy(tmpColor.set(hero.packTrim))
      }

      const activeEmote = peer.emote && performance.now() < peer.emoteUntilMs ? peer.emote : null
      const nextLabel = `${peer.name}|${peer.heightM}|${hero.swatch}|${activeEmote ?? ''}`
      if (st.labelKey !== nextLabel) {
        st.labelKey = nextLabel
        drawNametag(matSlot.canvas, matSlot.texture, peer.name, peer.heightM, hero.swatch, activeEmote)
      }

      g.visible = true
      const bob = Math.sin(clock.elapsedTime * 5 + i) * 0.03
      g.position.set(st.x, st.y + bob, st.z)
      g.rotation.y = st.yaw

      const bodyMesh = g.children[0] as Mesh | undefined
      if (bodyMesh && st.heroId === peer.heroId && matSlot.bodyMat.color.getHexString() !== tmpColor.set(hero.swatch).getHexString()) {
        matSlot.bodyMat.color.copy(tmpColor)
        matSlot.packMat.color.set(hero.packBody)
        matSlot.ringMat.color.set(hero.packTrim)
      }
    }
  })

  return (
    <group ref={rootRef} name="remote-players">
      {shared.slots.map((s, idx) => (
        <group
          key={idx}
          name={`remote-player-${idx}`}
          visible={false}
          ref={(el) => {
            slotRefs.current[idx] = el
          }}
        >
          <mesh geometry={shared.bodyGeo} material={s.bodyMat} position={[0, 0.85, 0]} castShadow />
          <mesh geometry={shared.headGeo} material={shared.headMat} position={[0, 1.62, 0]} castShadow />
          <mesh geometry={shared.packGeo} material={s.packMat} position={[0, 1.05, 0.27]} />
          <mesh geometry={shared.ringGeo} material={s.ringMat} position={[0, 0.08, 0]} />
          <sprite material={s.spriteMat} position={[0, 2.28, 0]} scale={[1.95, 0.42, 1]} renderOrder={10} />
        </group>
      ))}
    </group>
  )
}
