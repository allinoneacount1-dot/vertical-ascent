// TEST-12a, physics part (DIRECTIVE §7 row 12a, G2): walking off a 10 m cliff → lands ≤1.3 s after leaving the edge,
// y monotonic after landing, |vy| < 0.5 two frames after landing; a 200 m fall → bigFall set after vy < -12 m/s for
// more than 0.6 s, and the event is emitted. Headless harness, app frame path (FrameClock → beginFrame → stepFrame).
import { Vector3 } from 'three'
import { createHarness, round } from '/vitexec/lib/harness.ts'
import { FrameClock } from '/src/game/frame-clock.ts'
import { BIG_FALL_S, BIG_FALL_VY, CharacterController, NO_INPUT } from '/src/controller/character-controller.ts'
import type { ControlInput } from '/src/controller/character-controller.ts'

const failures: string[] = []
const results: Record<string, unknown> = {}

for (const fps of [60, 144]) {
  const dt = 1 / fps
  // ---- cliff: a 10 m block (top y = 10) with its +X edge at x = 2, floor below (top y = 0) ----
  {
    const h = createHarness(
      [
        { id: 'floor', size: [80, 1, 80], pos: [0, -0.5, 0] },
        { id: 'cliff', size: [4, 10, 4], pos: [0, 5, 0] },
      ],
      [0, 10, 0],
    )
    const clock = new FrameClock()
    let landAt: number | null = null
    const ctrl = new CharacterController(h.port, h.motion, { onLand: (i) => { if (i.fallMeters > 5 && landAt == null) landAt = i.simTime } })
    ctrl.onEnterPlaying()
    clock.begin(dt, true)
    const walk: ControlInput = { forward: 0, backward: 0, left: 0, right: 1, run: false } // +X with camera yaw 0
    const frame = (input: ControlInput) => {
      const d = clock.begin(dt, true)
      h.motion.beginFrame(d)
      ctrl.stepFrame(d, input, 0, 'hold')
    }
    for (let i = 0; i < fps / 2; i++) frame(NO_INPUT) // settle on the cliff top
    let leftAt: number | null = null
    let frames = 0
    while (landAt == null && frames < fps * 6) {
      const before = h.port.isGroundedRaw
      frame(walk)
      frames++
      if (leftAt == null && before && !h.port.isGroundedRaw && h.port.position.x > 1.5) leftAt = ctrl.simTime - dt
    }
    // after landing: release input, sample y and vy for 1 s
    const ys: number[] = []
    const vys: number[] = []
    for (let i = 0; i < fps; i++) {
      frame(NO_INPUT)
      ys.push(h.port.position.y)
      vys.push(h.port.velocity.y)
    }
    let monotonic = true
    for (let i = 1; i < ys.length; i++) if (ys[i] > ys[i - 1] + 1e-6) monotonic = false
    const fallS = landAt != null && leftAt != null ? landAt - leftAt : null
    const vyAfter2 = vys[1]
    const r = { fps, leftAt: leftAt && round(leftAt, 4), landAt: landAt && round(landAt, 4), fallS: fallS && round(fallS, 4), monotonic, vyAfter2Frames: round(vyAfter2, 4), yFinal: round(ys[ys.length - 1], 4) }
    results[`cliff ${fps} fps`] = r
    if (fallS == null || fallS > 1.3) failures.push(`cliff ${fps} fps: landing ${fallS} s after leaving (> 1.3)`)
    if (!monotonic) failures.push(`cliff ${fps} fps: y not monotonic after landing`)
    if (!(Math.abs(vyAfter2) < 0.5)) failures.push(`cliff ${fps} fps: |vy| ${vyAfter2} two frames after landing`)
  }
  // ---- 200 m fall: bigFall timing and event ----
  {
    const h = createHarness([{ id: 'floor', size: [80, 1, 80], pos: [0, -0.5, 0] }], [0, 200, 0])
    const clock = new FrameClock()
    let bigFallEventAt: number | null = null
    let landInfo: { bigFall: boolean; fallMeters: number } | null = null
    const ctrl = new CharacterController(h.port, h.motion, {
      onBigFall: (t) => { bigFallEventAt = t },
      onLand: (i) => { if (landInfo == null) landInfo = i },
    })
    ctrl.onEnterPlaying()
    clock.begin(dt, true)
    h.port.teleport(new Vector3(0, 200, 0))
    let below12Since: number | null = null
    let firstFlagAt: number | null = null
    let expectedEarliest: number | null = null
    let frames = 0
    while (landInfo == null && frames < fps * 20) {
      const d = clock.begin(dt, true)
      h.motion.beginFrame(d)
      ctrl.stepFrame(d, NO_INPUT, 0, 'hold')
      frames++
      const vy = h.port.velocity.y
      if (vy < BIG_FALL_VY && below12Since == null) below12Since = ctrl.simTime
      if (below12Since != null && expectedEarliest == null) expectedEarliest = below12Since + BIG_FALL_S
      if (ctrl.bigFall && firstFlagAt == null) firstFlagAt = ctrl.simTime
    }
    const li = landInfo as { bigFall: boolean; fallMeters: number } | null
    const r = {
      fps,
      vyBelow12At: below12Since && round(below12Since, 4),
      flagAt: firstFlagAt && round(firstFlagAt, 4),
      eventAt: bigFallEventAt && round(bigFallEventAt, 4),
      flagDelayAfterVy12S: firstFlagAt != null && below12Since != null ? round(firstFlagAt - below12Since, 4) : null,
      landedWithBigFall: li?.bigFall ?? null,
      fallM: li ? round(li.fallMeters, 2) : null,
    }
    results[`fall200 ${fps} fps`] = r
    if (firstFlagAt == null || below12Since == null) failures.push(`fall200 ${fps} fps: bigFall never set`)
    else {
      const delay = firstFlagAt - below12Since
      if (delay <= BIG_FALL_S - 1e-9) failures.push(`fall200 ${fps} fps: bigFall set ${delay} s after vy < -12 (must be > ${BIG_FALL_S})`)
      if (delay > BIG_FALL_S + dt + 1e-9) failures.push(`fall200 ${fps} fps: bigFall late (${delay} s)`)
    }
    if (bigFallEventAt == null || bigFallEventAt !== firstFlagAt) failures.push(`fall200 ${fps} fps: bigFall event missing or at a different time`)
    if (li == null || !li.bigFall) failures.push(`fall200 ${fps} fps: landing not marked bigFall`)
  }
}

if (failures.length) {
  console.log('TEST-12a numbers ' + JSON.stringify(results))
  throw new Error('TEST-12a FAIL ' + failures.join('; '))
}
console.log('TEST-12a PASS ' + JSON.stringify({ part: 'physics', thresholds: { landS: 1.3, vyAfter2: 0.5, bigFallVy: BIG_FALL_VY, bigFallS: BIG_FALL_S }, results }))
