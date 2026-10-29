// G0 first-run probe: waits for a real render before vitexec --screenshot is taken (docs/directive/ref/06-testing.md §Probe G0).
const t0 = performance.now()
while (!document.querySelector('canvas')) {
  if (performance.now() - t0 > 15000) throw new Error('no canvas')
  await new Promise((r) => setTimeout(r, 100))
}
let frames = 0
await new Promise<void>((res) => {
  const f = () => (++frames >= 60 ? res() : requestAnimationFrame(f))
  requestAnimationFrame(f)
})
// Give the lazily imported default model and clips a moment to appear after the first frames.
await new Promise((r) => setTimeout(r, 2000))
console.log('first-run frames=' + frames + ' ms=' + Math.round(performance.now() - t0))
