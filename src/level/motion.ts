// Kinematic platform motion and the world clock (DIRECTIVE D-011, D-012; ref/02 §Frame order, ref/04 §Carry).
// The only writer of kinematic platform transforms and of the world clock (ref/02 Pemilik besaran).
// Pure three.js: used by the game, the headless physics harness, lint and bots.
import { Box3, Matrix4, Mesh, Quaternion, Vector3 } from 'three'
import type { Object3D } from 'three'

export type Vec3 = [number, number, number]

/** ref/03 §Data level, platform.motion. */
export type Motion = {
  type: 'linear' | 'loop' | 'rotate'
  /** linear: ping-pong along the polyline; loop: closed loop through the points (offsets from the platform pos). */
  points: Vec3[]
  /** rotate only: rotation axis (only [0, 1, 0] is supported in G1). */
  axis?: Vec3
  periodS: number
  phaseS: number
  /** linear/loop: pause at each end point (linear) or each point (loop). */
  dwellS: number
}

/** Pose of a moving platform at a world-clock time, relative to its base position. */
export type Pose = { offset: Vector3; yaw: number }

const tmpA = new Vector3()
const tmpB = new Vector3()

function polylineLength(points: Vec3[], closed: boolean): number {
  let len = 0
  const n = points.length
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    tmpA.fromArray(points[i])
    tmpB.fromArray(points[(i + 1) % n])
    len += tmpA.distanceTo(tmpB)
  }
  return len
}

/** Point at arc length s along the polyline. */
function pointAt(points: Vec3[], closed: boolean, s: number, out: Vector3): Vector3 {
  const n = points.length
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    tmpA.fromArray(points[i])
    tmpB.fromArray(points[(i + 1) % n])
    const seg = tmpA.distanceTo(tmpB)
    if (s <= seg || i === (closed ? n : n - 1) - 1) {
      return out.copy(tmpA).lerp(tmpB, seg === 0 ? 0 : Math.min(1, Math.max(0, s / seg)))
    }
    s -= seg
  }
  return out.fromArray(points[n - 1])
}

const mod = (a: number, b: number) => ((a % b) + b) % b

/**
 * Evaluates a motion at time t (seconds of world clock). Constant speed between points, dwell at ends.
 * linear: 0 → end (half period minus dwell), dwell, end → 0, dwell.
 */
export function evaluateMotion(m: Motion, t: number, out: Pose): Pose {
  const local = mod(t + m.phaseS, m.periodS)
  if (m.type === 'rotate') {
    out.offset.set(0, 0, 0)
    out.yaw = (local / m.periodS) * Math.PI * 2
    return out
  }
  out.yaw = 0
  if (m.points.length < 2) {
    out.offset.fromArray(m.points[0] ?? [0, 0, 0])
    return out
  }
  if (m.type === 'linear') {
    const half = m.periodS / 2
    const travel = Math.max(1e-6, half - m.dwellS)
    const len = polylineLength(m.points, false)
    let s: number
    if (local < travel) s = (local / travel) * len
    else if (local < half) s = len
    else if (local < half + travel) s = (1 - (local - half) / travel) * len
    else s = 0
    pointAt(m.points, false, s, out.offset)
    return out
  }
  // loop: equal time per segment, dwell at every point
  const n = m.points.length
  const per = m.periodS / n
  const seg = Math.min(n - 1, Math.floor(local / per))
  const within = local - seg * per
  const travel = Math.max(1e-6, per - m.dwellS)
  const f = Math.min(1, within / travel)
  tmpA.fromArray(m.points[seg])
  tmpB.fromArray(m.points[(seg + 1) % n])
  out.offset.copy(tmpA).lerp(tmpB, f)
  return out
}

/** Speed of the platform surface (m/s) for a linear motion; used by tests and lint. */
export function linearSpeed(m: Motion): number {
  return polylineLength(m.points, false) / Math.max(1e-6, m.periodS / 2 - m.dwellS)
}

/** One moving platform (ref/04 §Carry 2). */
export type KinematicPlatform = {
  id: string
  /** Animated group ABOVE the BvhPhysicsBody (ref/04 §Carry 1). */
  mover: Object3D
  /** The BvhPhysicsBody kinematic root group; its matrixWorld is what the physics world queries. */
  body: Object3D
  /** Box collider mesh inside the body. */
  collider: Mesh
  basePos: Vector3
  baseYaw: number
  motion: Motion
  prev: Matrix4
  cur: Matrix4
  /** World velocity of the platform origin during the last advance (m/s). */
  linearVelocity: Vector3
  /** Yaw change during the last advance (rad). */
  yawDelta: number
  /** World AABB of the collider at cur. */
  worldAabb: Box3
  /** Phase in [0, 1) for window.__game.platforms. */
  phase: number
}

const pose: Pose = { offset: new Vector3(), yaw: 0 }
const posePrev: Pose = { offset: new Vector3(), yaw: 0 }
const q = new Quaternion()
const yAxis = new Vector3(0, 1, 0)
const p0 = new Vector3()
const p1 = new Vector3()

/**
 * World clock + registry of kinematic platforms. advance(dt) is the only place platform transforms change.
 */
export class PlatformMotion {
  readonly platforms = new Map<string, KinematicPlatform>()
  /** Seconds of simulated world time; stops while paused, resets to t0 on Restart (D-007). */
  worldClock: number
  private readonly t0: number

  constructor(t0 = 0) {
    this.t0 = t0
    this.worldClock = t0
  }

  register(p: Omit<KinematicPlatform, 'prev' | 'cur' | 'linearVelocity' | 'yawDelta' | 'worldAabb' | 'phase'>): KinematicPlatform {
    const entry: KinematicPlatform = {
      ...p,
      prev: new Matrix4(),
      cur: new Matrix4(),
      linearVelocity: new Vector3(),
      yawDelta: 0,
      worldAabb: new Box3(),
      phase: 0,
    }
    this.platforms.set(p.id, entry)
    this.place(entry, this.worldClock)
    entry.prev.copy(entry.cur)
    return entry
  }

  unregister(id: string): void {
    this.platforms.delete(id)
  }

  /** Writes the mover transform for time t and refreshes cur, the AABB and the phase. */
  private place(p: KinematicPlatform, t: number): void {
    evaluateMotion(p.motion, t, pose)
    p.mover.position.copy(p.basePos).add(pose.offset)
    q.setFromAxisAngle(yAxis, p.baseYaw + pose.yaw)
    p.mover.quaternion.copy(q)
    p.mover.updateMatrixWorld(true)
    p.cur.copy(p.body.matrixWorld)
    p.collider.updateWorldMatrix(true, false)
    if (p.collider.geometry.boundingBox == null) p.collider.geometry.computeBoundingBox()
    p.worldAabb.copy(p.collider.geometry.boundingBox!).applyMatrix4(p.collider.matrixWorld)
    p.phase = mod(t + p.motion.phaseS, p.motion.periodS) / p.motion.periodS
  }

  /** Largest displacement (m) of any platform surface point between now and now + dt (ref/02 §Frame order -3). */
  maxDisplacement(dt: number): number {
    let max = 0
    for (const p of this.platforms.values()) {
      evaluateMotion(p.motion, this.worldClock, posePrev)
      evaluateMotion(p.motion, this.worldClock + dt, pose)
      let d = p0.copy(posePrev.offset).distanceTo(p1.copy(pose.offset))
      if (p.motion.type === 'rotate') {
        // surface speed at the collider's farthest corner from the axis
        const size = p.worldAabb.getSize(p0)
        const radius = Math.hypot(size.x, size.z) / 2
        d += Math.abs(pose.yaw - posePrev.yaw) * radius
      }
      if (d > max) max = d
    }
    return max
  }

  /** n = max(1, ceil(disp / 0.2)) (D-011). */
  slicesFor(dt: number): number {
    return Math.max(1, Math.ceil(this.maxDisplacement(dt) / 0.2 - 1e-9))
  }

  /** Slices for the current frame, set by beginFrame (priority -3) and read by the controller (-2). */
  slices = 1

  /**
   * Priority -3 (ref/02 §Frame order). dt = clamped frame delta, 0 when physics does not run this frame.
   * n == 1: advance the world clock and every platform now; n > 1: the controller advances per slice.
   */
  beginFrame(dt: number): void {
    if (dt <= 0) {
      this.slices = 1
      return
    }
    this.slices = this.slicesFor(dt)
    if (this.slices === 1) this.advance(dt)
  }

  /** Advances the world clock by dt and moves every platform: prev ← cur, cur ← body.matrixWorld. */
  advance(dt: number): void {
    this.worldClock += dt
    for (const p of this.platforms.values()) {
      p.prev.copy(p.cur)
      p0.setFromMatrixPosition(p.prev)
      evaluateMotion(p.motion, this.worldClock - dt, posePrev)
      this.place(p, this.worldClock)
      p1.setFromMatrixPosition(p.cur)
      if (dt > 0) p.linearVelocity.copy(p1).sub(p0).divideScalar(dt)
      else p.linearVelocity.set(0, 0, 0)
      evaluateMotion(p.motion, this.worldClock, pose)
      // wrap to (-π, π]: rotate motions jump from 2π back to 0 once per period
      p.yawDelta = Math.atan2(Math.sin(pose.yaw - posePrev.yaw), Math.cos(pose.yaw - posePrev.yaw))
    }
  }

  /** prev = cur for every platform (Restart and resume, ref/04 §Carry 2). */
  syncPrev(): void {
    for (const p of this.platforms.values()) {
      p.prev.copy(p.cur)
      p.linearVelocity.set(0, 0, 0)
      p.yawDelta = 0
    }
  }

  /** World clock back to t0 and every platform placed there (Restart, D-007). */
  reset(): void {
    this.worldClock = this.t0
    for (const p of this.platforms.values()) this.place(p, this.worldClock)
    this.syncPrev()
  }

  /** True when worldBox overlaps any platform collider's world AABB (vendored physics forceWriteBack). */
  readonly nearKinematic = (worldBox: Box3): boolean => {
    for (const p of this.platforms.values()) if (p.worldAabb.intersectsBox(worldBox)) return true
    return false
  }
}
