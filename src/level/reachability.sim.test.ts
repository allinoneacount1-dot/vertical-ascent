/// <reference types="node" />
// Reachability sim test (ref/03 §Lint, TEST-36): every route pair of the 500 m world replayed with the vendored physics
// on a two-box world (source and destination colliders at the poses the route was generated for) and the bot's input:
// stand on the takeoff point, aim at the target, run (when the route says so) + jump, steer in the air, release forward
// above the target, second jump at the apex where the pair needs it. Pass = grounded on the destination within 3 s.
// Writes evidence/G3/TEST-36-sim.json (per-pair result), read by scripts/level-lint.mjs for ROUTE-UNPROVEN.
import { mkdirSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Object3D, Vector3 } from 'three'
import { BvhPhysicsWorld } from '@pmndrs/viverse'
import { createCharacterPhysicsPort } from '../physics/character-physics.ts'
import { CharacterController } from '../controller/character-controller.ts'
import type { ControlInput } from '../controller/character-controller.ts'
import { FrameClock } from '../game/frame-clock.ts'
import { PlatformMotion, evaluateMotion } from './motion.ts'
import type { Motion, Pose, Vec3 } from './motion.ts'
import { mainLevel, PREFABS } from './levels.ts'
import type { PlatformEntry, Prefab } from './schema.ts'
import mainRoute from '../../vitexec/routes/main.json'

type Wp = { id: string; zone: string; takeoff: Vec3; target: Vec3; needsSprint: boolean; needsDoubleJump: boolean; pos: Vec3; half: [number, number] }
const route = mainRoute as unknown as { waypoints: Wp[] }
const level = mainLevel()
const prefabs = new Map<string, Prefab>(PREFABS.map((p) => [p.id, p]))
const byId = new Map<string, PlatformEntry>(level.platforms.map((e) => [e.id, e]))
const DT = 1 / 60
const LIMIT_S = 3
const invisible = new MeshBasicMaterial({ visible: false })
const pose: Pose = { offset: new Vector3(), yaw: 0 }

/** Collider box (centre, size, yaw) of an entry at motion phase u (null = base pose). */
function boxOf(e: PlatformEntry, u: number | null) {
  const p = prefabs.get(e.prefab)!
  const c = p.collider!
  const off = new Vector3()
  if (u != null && e.motion && e.motion.type !== 'rotate') {
    evaluateMotion(e.motion as Motion, u * e.motion.periodS - e.motion.phaseS, pose)
    off.copy(pose.offset)
  }
  const o = new Vector3(c.offset[0] * p.scale, c.offset[1] * p.scale, c.offset[2] * p.scale).applyAxisAngle(new Vector3(0, 1, 0), e.rotY)
  const centre = new Vector3().fromArray(e.pos).add(off).add(o)
  return { centre, size: [c.size[0] * p.scale, c.size[1] * p.scale, c.size[2] * p.scale] as Vec3, yaw: e.rotY }
}

function simulate(a: ReturnType<typeof boxOf>, b: ReturnType<typeof boxOf>, wp: Wp) {
  const world = new BvhPhysicsWorld()
  const root = new Group()
  const statics = new Group()
  for (const box of [a, b]) {
    const mesh = new Mesh(new BoxGeometry(...box.size), invisible)
    mesh.position.copy(box.centre)
    mesh.rotation.set(0, box.yaw, 0, 'YXZ')
    statics.add(mesh)
  }
  root.add(statics)
  root.updateWorldMatrix(true, true)
  world.addBody(statics, false)
  const character = new Object3D()
  root.add(character)
  const motion = new PlatformMotion(0)
  const port = createCharacterPhysicsPort(world, character, {}, motion.nearKinematic)
  const ctrl = new CharacterController(port, motion, {})
  const clock = new FrameClock()
  const start = new Vector3(wp.takeoff[0], a.centre.y + a.size[1] / 2 + 0.02, wp.takeoff[2])
  ctrl.resetRun(start, 0, false)
  ctrl.onEnterPlaying()
  // settle on the source
  for (let i = 0; i < 20; i++) {
    const dt = clock.begin(DT, true)
    motion.beginFrame(dt)
    ctrl.stepFrame(dt, { forward: 0, backward: 0, left: 0, right: 0, run: false }, 0, 'hold')
  }
  const top = b.centre.y + b.size[1] / 2
  let pressed = false
  let second = false
  let airborne = false
  let t = 0
  while (t < LIMIT_S) {
    const p = port.position
    const dx = wp.target[0] - p.x
    const dz = wp.target[2] - p.z
    const yaw = Math.atan2(-dx, -dz)
    const forward = Math.hypot(dx, dz) < 0.3 && airborne ? 0 : 1
    const input: ControlInput = { forward, backward: 0, left: 0, right: 0, run: false }
    if (!pressed) {
      ctrl.pressJump()
      pressed = true
    }
    if (wp.needsDoubleJump && airborne && !second && port.velocity.y < 0) {
      ctrl.pressJump()
      second = true
    }
    const dt = clock.begin(DT, true)
    motion.beginFrame(dt)
    ctrl.stepFrame(dt, input, yaw, wp.needsSprint ? 'always' : 'hold')
    t += dt
    if (!port.isGroundedRaw) airborne = true
    const q = port.position
    const onB = Math.abs(q.y - top) < 0.25 && Math.abs(q.x - wp.pos[0]) <= wp.half[0] && Math.abs(q.z - wp.pos[2]) <= wp.half[1]
    if (airborne && port.isGroundedRaw) return { ok: onB, t, feet: [q.x, q.y, q.z].map((v) => Math.round(v * 1000) / 1000) }
  }
  const q = port.position
  return { ok: false, t, feet: [q.x, q.y, q.z].map((v) => Math.round(v * 1000) / 1000) }
}

describe('reachability sim (TEST-36)', () => {
  it('every route pair of the 500 m world lands on its destination within 3 s', () => {
    const wps = route.waypoints
    const results: Array<{ from: string; to: string; zone: string; ok: boolean; t: number; feet: number[] }> = []
    for (let i = 1; i < wps.length; i++) {
      const fromE = byId.get(wps[i - 1].id)!
      const toE = byId.get(wps[i].id)!
      // poses the route was generated for: off a mover in the middle of its end dwell, onto a mover at its start dwell (u 0.99)
      const a = boxOf(fromE, fromE.motion?.type === 'linear' ? (fromE.motion.periodS / 2 - fromE.motion.dwellS / 2) / fromE.motion.periodS : null)
      const b = boxOf(toE, toE.motion?.type === 'linear' ? 0.99 : null)
      const r = simulate(a, b, wps[i])
      results.push({ from: fromE.id, to: toE.id, zone: wps[i].zone, ok: r.ok, t: Math.round(r.t * 1000) / 1000, feet: r.feet })
    }
    const failed = results.filter((r) => !r.ok)
    mkdirSync('evidence/G3', { recursive: true })
    writeFileSync('evidence/G3/TEST-36-sim.json', JSON.stringify({ test: 'TEST-36 sim', pairs: results.length, failed: failed.length, results }, null, 2) + '\n')
    console.log(`sim pairs ${results.length}, failed ${failed.length}`, failed.slice(0, 20))
    expect(failed).toEqual([])
  }, 300_000)
})
