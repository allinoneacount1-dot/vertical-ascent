// Ghibli-styled interactive challenge objects (Tahap 1–3):
// Bounce canopies & mushrooms, crumbling Laputa ruins, slippery wet roofs & ice pillars,
// cable gondolas, rotating wooden windmill blades, copper steam pipes, Catch Decks, and Sky Balloon mega-skip.
// Only mounted on the 'main' 500 m world so slice/g1-blockout tests remain completely untouched.
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Mesh, Vector3 } from 'three'
import type { Object3D } from 'three'
import { BvhPhysicsBody } from '@react-three/viverse'
import type { LoadedLevel } from './levels.ts'
import { CHALLENGE_SPECS } from './challenges.ts'
import type { ChallengeSpec } from './challenges.ts'
import { game } from '../game/game.ts'

const ROTATION_ORDER = 'YXZ' as const

/** Striped Ghibli market canopy or glowing bouncy forest/sky mushroom with squash-stretch animation. */
function BouncePad({ spec }: { spec: ChallengeSpec }) {
  const visRef = useRef<Group>(null)
  const [w, h, d] = spec.size
  const isCanopy = spec.style === 'canopy'
  const rot: [number, number, number, 'YXZ'] = [spec.rotX ?? 0, spec.rotY ?? 0, 0, ROTATION_ORDER]

  useFrame(() => {
    const g = visRef.current
    if (!g) return
    const sq = game.challenges.bounceSquash.get(spec.id) ?? 0
    if (sq > 0) {
      const wave = Math.sin(sq * Math.PI * 3) * sq
      g.scale.set(1 + wave * 0.16, 1 - wave * 0.34, 1 + wave * 0.16)
    } else if (g.scale.y !== 1) {
      g.scale.set(1, 1, 1)
    }
  })

  return (
    <>
      <group position={spec.pos} rotation={rot}>
        <group ref={visRef}>
          {isCanopy ? (
            <>
              <mesh position={[0, h * 0.12, 0]} castShadow receiveShadow>
                <boxGeometry args={[w, h * 0.45, d]} />
                <meshStandardMaterial color="#d95b43" roughness={0.78} />
              </mesh>
              <mesh position={[0, h * 0.36, 0]} receiveShadow>
                <boxGeometry args={[w * 0.65, 0.08, d * 0.96]} />
                <meshStandardMaterial color="#f7ebd2" roughness={0.8} />
              </mesh>
              {([-1, 1] as const).map((sx) =>
                ([-1, 1] as const).map((sz) => (
                  <mesh key={`${sx},${sz}`} position={[sx * (w / 2 - 0.18), -h * 0.85, sz * (d / 2 - 0.18)]} castShadow>
                    <cylinderGeometry args={[0.08, 0.09, h * 1.6, 8]} />
                    <meshStandardMaterial color="#6e4b32" roughness={0.9} />
                  </mesh>
                )),
              )}
            </>
          ) : (
            <>
              <mesh position={[0, h * 0.12, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[w * 0.48, w * 0.54, h * 0.65, 14]} />
                <meshStandardMaterial color="#e07a5f" emissive="#8f3b2a" emissiveIntensity={0.35} roughness={0.65} />
              </mesh>
              <mesh position={[0, h * 0.46, 0]} receiveShadow>
                <cylinderGeometry args={[w * 0.24, w * 0.3, 0.09, 12]} />
                <meshStandardMaterial color="#fff3d1" emissive="#ffd97d" emissiveIntensity={0.45} roughness={0.5} />
              </mesh>
              <mesh position={[0, -h * 0.9, 0]} castShadow>
                <cylinderGeometry args={[w * 0.16, w * 0.24, h * 1.5, 10]} />
                <meshStandardMaterial color="#e9dec8" roughness={0.88} />
              </mesh>
            </>
          )}
        </group>
      </group>
      <BvhPhysicsBody>
        <mesh position={spec.pos} rotation={rot}>
          <boxGeometry args={[w, h, d]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </BvhPhysicsBody>
    </>
  )
}

/** Floating Laputa crumbling stone ruin: 1.2 s shake + falling pebbles + crack SFX → 5 s collapse → respawn. */
function CrumblingRuin({ spec }: { spec: ChallengeSpec }) {
  const rootRef = useRef<Group>(null)
  const visRef = useRef<Group>(null)
  const pebblesRef = useRef<Group>(null)
  const [w, h, d] = spec.size

  useFrame((state) => {
    const root = rootRef.current
    const vis = visRef.current
    const pebbles = pebblesRef.current
    if (!root || !vis || !pebbles) return
    const st = game.challenges.crumbles.get(spec.id)
    if (!st || st.phase === 'solid') {
      root.position.set(spec.pos[0], spec.pos[1], spec.pos[2])
      vis.visible = true
      vis.position.set(0, 0, 0)
      pebbles.visible = false
    } else if (st.phase === 'shaking') {
      root.position.set(spec.pos[0], spec.pos[1], spec.pos[2])
      vis.visible = true
      const t = state.clock.elapsedTime * 42
      const amp = 0.06 + (st.timer / 1.2) * 0.09
      vis.position.set(Math.sin(t) * amp, Math.cos(t * 1.3) * amp * 0.4, Math.cos(t * 0.9) * amp)
      pebbles.visible = true
      const drop = (st.timer % 0.6) * 4.5
      pebbles.position.set(0, -h / 2 - drop, 0)
    } else {
      root.position.set(spec.pos[0], -5000, spec.pos[2])
      vis.visible = false
      pebbles.visible = false
    }
  })

  return (
    <group ref={rootRef} position={spec.pos}>
      <group ref={visRef}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color="#8f8a7e" roughness={0.92} />
        </mesh>
        <mesh position={[0, h / 2 + 0.03, 0]} receiveShadow>
          <boxGeometry args={[w * 0.92, 0.06, d * 0.92]} />
          <meshStandardMaterial color="#7da376" roughness={0.9} />
        </mesh>
        <mesh position={[0, h / 2 + 0.065, 0]}>
          <boxGeometry args={[w * 0.72, 0.02, 0.1]} />
          <meshStandardMaterial color="#ffcf70" emissive="#ff9f2e" emissiveIntensity={0.8} />
        </mesh>
      </group>
      <group ref={pebblesRef} visible={false}>
        {([-0.7, 0.1, 0.8] as const).map((px, i) => (
          <mesh key={i} position={[px, -i * 0.35, (i - 1) * 0.55]}>
            <boxGeometry args={[0.2, 0.18, 0.2]} />
            <meshStandardMaterial color="#706b60" roughness={0.95} />
          </mesh>
        ))}
      </group>
      <BvhPhysicsBody kinematic>
        <mesh>
          <boxGeometry args={[w, h, d]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </BvhPhysicsBody>
    </group>
  )
}

/** Slippery tilted wet clay roof (z1) or wet marble/ice sky pillar (z4). */
function SlipperySurface({ spec }: { spec: ChallengeSpec }) {
  const [w, h, d] = spec.size
  const isRoof = spec.style === 'roof'
  const rot: [number, number, number, 'YXZ'] = [spec.rotX ?? 0, spec.rotY ?? 0, 0, ROTATION_ORDER]
  return (
    <>
      <group position={spec.pos} rotation={rot}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial
            color={isRoof ? '#9c4a38' : '#b7e3f7'}
            roughness={isRoof ? 0.22 : 0.14}
            metalness={isRoof ? 0.15 : 0.25}
          />
        </mesh>
        <mesh position={[0, h / 2 + 0.02, 0]}>
          <boxGeometry args={[w * 0.94, 0.03, d * 0.94]} />
          <meshStandardMaterial
            color={isRoof ? '#c76850' : '#e1f6ff'}
            emissive={isRoof ? '#3a1a12' : '#58b4de'}
            emissiveIntensity={isRoof ? 0.1 : 0.35}
            roughness={0.12}
            metalness={0.3}
          />
        </mesh>
      </group>
      <BvhPhysicsBody>
        <mesh position={spec.pos} rotation={rot}>
          <boxGeometry args={[w, h, d]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </BvhPhysicsBody>
    </>
  )
}

/** Kinematic challenge mover registered in game.motion (Gondola, Windmill Blade, Sky Balloon). */
function ChallengeMover({ spec }: { spec: ChallengeSpec }) {
  const moverRef = useRef<Group>(null)
  const bodyRef = useRef<Object3D>(null)
  const colliderRef = useRef<Mesh>(null)
  const [w, h, d] = spec.size

  useLayoutEffect(() => {
    if (!moverRef.current || !bodyRef.current || !colliderRef.current || !spec.motion) return
    game.motion.register({
      id: spec.id,
      mover: moverRef.current,
      body: bodyRef.current,
      collider: colliderRef.current,
      basePos: new Vector3().fromArray(spec.pos),
      baseYaw: spec.rotY ?? 0,
      motion: spec.motion,
    })
    return () => game.motion.unregister(spec.id)
  }, [spec])

  return (
    <group ref={moverRef} position={spec.pos} rotation={[0, spec.rotY ?? 0, 0, ROTATION_ORDER]}>
      {spec.style === 'gondola' && (
        <group>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial color="#8f5f3c" roughness={0.78} />
          </mesh>
          <mesh position={[0, h / 2 + 0.03, 0]}>
            <boxGeometry args={[w * 0.92, 0.05, d * 0.92]} />
            <meshStandardMaterial color="#d8a84e" roughness={0.45} metalness={0.35} />
          </mesh>
          <mesh position={[0, 2.6, 0]}>
            <boxGeometry args={[w * 0.85, 0.14, 0.14]} />
            <meshStandardMaterial color="#4a5562" metalness={0.5} roughness={0.4} />
          </mesh>
          {([-1, 1] as const).map((sx) => (
            <mesh key={sx} position={[sx * (w * 0.38), 1.35, 0]}>
              <cylinderGeometry args={[0.05, 0.05, 2.5, 8]} />
              <meshStandardMaterial color="#c99a45" metalness={0.45} roughness={0.45} />
            </mesh>
          ))}
        </group>
      )}
      {spec.style === 'windmill' && (
        <group>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial color="#a67549" roughness={0.82} />
          </mesh>
          <mesh position={[0, h / 2 + 0.02, 0]}>
            <boxGeometry args={[w * 0.94, 0.04, d * 0.65]} />
            <meshStandardMaterial color="#f5e9d3" roughness={0.85} />
          </mesh>
        </group>
      )}
      {spec.style === 'balloon' && (
        <group>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial color="#9e6d3f" roughness={0.85} />
          </mesh>
          {([-1, 1] as const).map((sx) =>
            ([-1, 1] as const).map((sz) => (
              <mesh key={`${sx},${sz}`} position={[sx * 1.4, 3.2, sz * 1.4]}>
                <cylinderGeometry args={[0.04, 0.04, 6.0, 6]} />
                <meshStandardMaterial color="#d8c39e" roughness={0.9} />
              </mesh>
            )),
          )}
          <mesh position={[0, 8.6, 0]} castShadow>
            <sphereGeometry args={[3.8, 16, 12]} />
            <meshStandardMaterial color="#e0634f" roughness={0.72} />
          </mesh>
          <mesh position={[0, 8.6, 0]}>
            <cylinderGeometry args={[3.85, 3.85, 1.4, 16]} />
            <meshStandardMaterial color="#f7e3a1" emissive="#f2b84b" emissiveIntensity={0.25} roughness={0.65} />
          </mesh>
        </group>
      )}
      <BvhPhysicsBody
        kinematic
        ref={(g) => {
          bodyRef.current = g
          if (g) g.name = spec.id
        }}
      >
        <mesh ref={colliderRef}>
          <boxGeometry args={[w, h, d]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </BvhPhysicsBody>
    </group>
  )
}

/** Narrow copper steam pipe in z2 (~0.45 m visual, 0.5 m collider) with rising hiss/blast steam cloud. */
function SteamPipe({ spec }: { spec: ChallengeSpec }) {
  const jetRef = useRef<Group>(null)
  const [w, h, d] = spec.size
  const dir = spec.steamDir ?? [1, 0.35, 0]
  const rot: [number, number, number, 'YXZ'] = [0, spec.rotY ?? 0, 0, ROTATION_ORDER]

  useFrame((state) => {
    const jet = jetRef.current
    if (!jet) return
    const st = game.challenges.steamStates.get(spec.id)
    if (!st || st.phase === 'idle') {
      jet.visible = false
      return
    }
    jet.visible = true
    const pulse = 0.85 + Math.sin(state.clock.elapsedTime * 28) * 0.15
    const s = st.phase === 'blast' ? 1.35 * pulse : 0.45 * st.intensity
    jet.scale.set(s, s, s)
  })

  return (
    <>
      <group position={spec.pos} rotation={rot}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.225, 0.225, d, 12]} />
          <meshStandardMaterial color="#b86b3a" roughness={0.38} metalness={0.62} />
        </mesh>
        <mesh position={[0, 0.1, 0]}>
          <cylinderGeometry args={[0.3, 0.3, 0.35, 10]} />
          <meshStandardMaterial color="#d8a84e" roughness={0.35} metalness={0.55} />
        </mesh>
        <group ref={jetRef} position={[dir[0] * 1.1, 0.55 + dir[1] * 0.5, dir[2] * 1.1]} visible={false}>
          <mesh>
            <sphereGeometry args={[0.65, 10, 8]} />
            <meshBasicMaterial color="#f5fbff" transparent opacity={0.72} depthWrite={false} />
          </mesh>
          <mesh position={[dir[0] * 0.9, 0.25, dir[2] * 0.9]}>
            <sphereGeometry args={[0.85, 10, 8]} />
            <meshBasicMaterial color="#e8f6ff" transparent opacity={0.5} depthWrite={false} />
          </mesh>
        </group>
      </group>
      <BvhPhysicsBody>
        <mesh position={spec.pos} rotation={rot}>
          <boxGeometry args={[w, h, d]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </BvhPhysicsBody>
    </>
  )
}

/** Partial Catch Deck at zone transitions (125 m, 250 m, 375 m) with warm Ghibli lanterns. */
function CatchDeck({ spec }: { spec: ChallengeSpec }) {
  const [w, h, d] = spec.size
  return (
    <>
      <group position={spec.pos}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color="#87a683" roughness={0.88} />
        </mesh>
        <mesh position={[0, -h * 0.4, 0]}>
          <boxGeometry args={[w * 0.94, h * 0.5, d * 0.94]} />
          <meshStandardMaterial color="#7a7268" roughness={0.92} />
        </mesh>
        {([-1, 1] as const).map((sx) =>
          ([-1, 1] as const).map((sz) => (
            <mesh key={`${sx},${sz}`} position={[sx * (w / 2 - 0.5), h / 2 + 0.35, sz * (d / 2 - 0.5)]}>
              <boxGeometry args={[0.35, 0.7, 0.35]} />
              <meshStandardMaterial color="#fff3cc" emissive="#ffc857" emissiveIntensity={1.2} roughness={0.35} />
            </mesh>
          )),
        )}
      </group>
      <BvhPhysicsBody>
        <mesh position={spec.pos}>
          <boxGeometry args={[w, h, d]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </BvhPhysicsBody>
    </>
  )
}

export function ChallengeObjects({ level }: { level: LoadedLevel }) {
  const active = useMemo(() => level.id === 'main', [level.id])
  if (!active) return null
  return (
    <>
      {CHALLENGE_SPECS.map((spec) => {
        if (spec.kind === 'bounce') return <BouncePad key={spec.id} spec={spec} />
        if (spec.kind === 'crumbling') return <CrumblingRuin key={spec.id} spec={spec} />
        if (spec.kind === 'slippery') return <SlipperySurface key={spec.id} spec={spec} />
        if (spec.kind === 'gondola' || spec.kind === 'windmill' || spec.kind === 'skyBalloon') {
          return <ChallengeMover key={spec.id} spec={spec} />
        }
        if (spec.kind === 'steamPipe') return <SteamPipe key={spec.id} spec={spec} />
        if (spec.kind === 'catchDeck') return <CatchDeck key={spec.id} spec={spec} />
        return null
      })}
    </>
  )
}
