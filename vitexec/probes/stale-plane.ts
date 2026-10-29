// D-032 evidence: BvhPhysicsWorld refills one ExtendedTriangle with Triangle.copy (needsUpdate stays false),
// so closestPointToSegment uses the cached plane of an earlier triangle. Compare stale vs fresh results.
import { Line3, Plane, Vector3 } from 'three'
import { createHarness } from '/vitexec/lib/harness.ts'
import { BLOCKOUT } from '/src/level/blockout.ts'

const h = createHarness(BLOCKOUT.filter((b) => b.collider && !b.motion))
const segment = new Line3()
const fresh = new Plane()
let triangles = 0
let stalePlanes = 0
let differing = 0
let falsePierce = 0
let missedPierce = 0
// deterministic pseudo-random capsule segments around the blockout
let seed = 12345
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
for (let i = 0; i < 4000; i++) {
  const x = -16 + rand() * 30
  const z = -14 + rand() * 30
  const y = -0.5 + rand() * 6
  segment.start.set(x, y + 0.4, z)
  segment.end.set(x, y + 1.3, z)
  const box = { min: new Vector3(x - 0.4, y, z - 0.4), max: new Vector3(x + 0.4, y + 1.7, z + 0.4) }
  h.world.shapecast(
    (b) => b.intersectsBox(box as never),
    (tri) => {
      triangles++
      const t = tri as unknown as { plane: Plane; needsUpdate: boolean; closestPointToSegment(s: Line3): number }
      tri.getPlane(fresh)
      const isStale = Math.abs(t.plane.normal.dot(fresh.normal) - 1) > 1e-6 || Math.abs(t.plane.constant - fresh.constant) > 1e-6
      if (isStale) stalePlanes++
      const dStale = t.closestPointToSegment(segment)
      t.needsUpdate = true
      const dFresh = t.closestPointToSegment(segment)
      if (Math.abs(dStale - dFresh) > 1e-6) differing++
      if (dStale === 0 && dFresh !== 0) falsePierce++
      if (dFresh === 0 && dStale !== 0) missedPierce++
    },
  )
}
console.log('stale-plane ' + JSON.stringify({ segments: 4000, triangles, stalePlanes, differing, falsePierce, missedPierce }))
