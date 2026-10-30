#!/usr/bin/env node
// Production smoke runner (docs/directive/ref/06-testing.md §Smoke produksi; DIRECTIVE D-018, D-020, §7 rows 01,
// 18b, 21, 22, 27, 30). Serves a built folder (dist/ or an extracted zip) with its own node:http server at
// http://127.0.0.1:<port>/<base> and drives Playwright Chromium (channel 'chromium', the project's devDependency).
// Input is trusted page.mouse / page.keyboard only; pointer lock comes from real clicks on the UI buttons;
// window.__game is only read (ref/02 §window.__game).
//   node scripts/smoke-dist.mjs --test <01|21|18b|27|30|22> [--dist dist] [--base sub/] [--port 5180] [--headed]
//        [--har <file.har>] [--size-exceptions <a.glb,assets/b.vrm>] [--viewport 1280x720]
//        [--browser-arg <arg>]... [--timeout <s>] [--load-deadline <s>] [--seconds <s>]
// --base has NO leading slash: Git Bash rewrites "/sub/" into a Windows path. Run it through the TEST runner, e.g.
//   pnpm build && node scripts/run-test.mjs 21 --slug dist --cmd "node scripts/smoke-dist.mjs --test 21 --dist dist --base sub/"
// Output: one line per check "check <name> <PASS|FAIL> <json>", the renderer string once ("env {...}"), page errors
// as "[page error] ...", console errors as "[error] ..." (both flagged by scripts/run-test.mjs), last line
// "# smoke-dist <test> PASS|FAIL"; exit 1 on FAIL, 2 on usage errors.
// Setups, each labelled in the log: "prod: reload" (TEST-30: pagehide through page.reload(), ref/06 §Allowlist) and
// "synthetic: settings-seed" (rawInput:false before the first Play click, D-040 test isolation).
// 1 MB = 1,000,000 bytes in every budget below (the stricter reading).
import { createServer } from 'node:http'
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, extname, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'

const MB = 1_000_000
const LIMITS = {
  frames: 60, // §7 row 01
  bvhMs: 1500, // §7 row 21, D-013
  bvhTris: 300_000, // §7 row 21, D-013
  distFiles: 1000, // §7 row 21, D-020
  pathChars: 240, // §7 row 21, D-020
  fileBytes: 10 * MB, // §7 row 21, D-020
  firstLoadBytes: 25 * MB, // §7 row 21, D-020
  heapDeltaBytes: 10 * MB, // §7 row 27
  restarts: 10, // §7 rows 18b, 27
  restoreTolM: 0.05, // §7 row 30
  timerTolMs: 50, // TEST-30: the timer may tick once between the restore and the first PLAYING frame read
}
const TESTS = {
  '01': 'load: canvas, >=60 frames, worldReady, 0 page errors (+ Play reaches locked PLAYING)',
  '21': '01 + BVH bake/triangle budget + dist/ file budget + first-load bytes',
  '18b': 'HAR: load + Play + 10 confirmed restarts; foreign hosts, 4xx/5xx, text/html assets',
  '27': '10 confirmed restarts: renderer.info memory, programs, JS heap, no Canvas remount',
  '30': 'pagehide save (grounded / airborne) -> reload -> Continue; New climb needs confirmation',
  '22': 'first-load bytes and spawn frame time (reported, not judged)',
}
const TYPES = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  md: 'text/plain; charset=utf-8',
  wasm: 'application/wasm',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  vrm: 'model/gltf-binary',
  bin: 'application/octet-stream',
  hdr: 'application/octet-stream',
  ktx2: 'image/ktx2',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
}

// ---- arguments -------------------------------------------------------------------------------------------------

function usage(msg) {
  if (msg) console.error(`smoke-dist: ${msg}`)
  console.error('usage: node scripts/smoke-dist.mjs --test <id> [--dist dist] [--base sub/] [--port 5180] [--headed]')
  console.error('         [--har <file.har>] [--size-exceptions <a,b>] [--viewport WxH] [--browser-arg <arg>]...')
  console.error('         [--timeout <s>] [--load-deadline <s>] [--seconds <s>]')
  for (const [id, what] of Object.entries(TESTS)) console.error(`  --test ${id.padEnd(4)} ${what}`)
  process.exit(2)
}

function positive(name, raw) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) usage(`${name} needs a positive number, got "${raw}"`)
  return n
}

/** "sub/" or "sub/dir/" (no leading slash); "" serves the folder at the root. */
function normalizeBase(raw) {
  if (/^[A-Za-z]:[\\/]/.test(raw) || raw.includes('\\')) {
    usage(`--base "${raw}" looks like a Windows path (Git Bash rewrote a leading "/"): pass it without the slash, e.g. --base sub/`)
  }
  let b = raw.replace(/^\/+/, '')
  if (b === '' || b === '.' || b === './') return ''
  if (!b.endsWith('/')) b += '/'
  if (!/^([A-Za-z0-9_-][A-Za-z0-9._-]*\/)+$/.test(b) || b.split('/').some((s) => s === '..')) usage(`bad --base "${raw}"`)
  return b
}

const opts = {
  test: null,
  dist: 'dist',
  base: 'sub/',
  port: 5180,
  headed: false,
  har: null,
  sizeExceptions: [],
  viewport: { width: 1280, height: 720 },
  browserArgs: [],
  timeoutS: 600,
  loadDeadlineS: 15,
  seconds: 10,
}
{
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const val = () => {
      const v = argv[++i]
      if (v == null) usage(`${a} needs a value`)
      return v
    }
    if (a.startsWith('--browser-arg=')) {
      opts.browserArgs.push(a.slice('--browser-arg='.length))
      continue
    }
    switch (a) {
      case '--test':
        opts.test = val().replace(/^TEST-/i, '').toLowerCase()
        break
      case '--dist':
        opts.dist = val()
        break
      case '--base':
        opts.base = val()
        break
      case '--port':
        opts.port = positive(a, val())
        break
      case '--headed':
        opts.headed = true
        break
      case '--har':
        opts.har = val()
        break
      case '--size-exceptions':
        opts.sizeExceptions = val()
          .split(',')
          .map((s) => s.trim().replaceAll('\\', '/'))
          .filter((s) => s !== '')
        break
      case '--viewport': {
        const m = /^(\d+)x(\d+)$/.exec(val())
        if (!m) usage('--viewport needs WxH, e.g. 1280x720')
        opts.viewport = { width: Number(m[1]), height: Number(m[2]) }
        break
      }
      case '--browser-arg':
        opts.browserArgs.push(val())
        break
      case '--timeout':
        opts.timeoutS = positive(a, val())
        break
      case '--load-deadline':
        opts.loadDeadlineS = positive(a, val())
        break
      case '--seconds':
        opts.seconds = positive(a, val())
        break
      default:
        usage(`unknown argument "${a}"`)
    }
  }
}
if (opts.test == null) usage('missing --test')
if (!(opts.test in TESTS)) usage(`unknown --test "${opts.test}"`)
if (opts.test === '18b' && opts.har == null) usage('--test 18b needs --har <file.har>')
const base = normalizeBase(opts.base)
const root = resolve(opts.dist)
if (!existsSync(resolve(root, 'index.html'))) usage(`--dist ${opts.dist}: no index.html in ${root}`)
const harPath = opts.har == null ? null : resolve(opts.har)
if (harPath) mkdirSync(dirname(harPath), { recursive: true })
const pageHost = `127.0.0.1:${opts.port}`
const url = `http://${pageHost}/${base}`

// ---- report ----------------------------------------------------------------------------------------------------

const results = []
const oneLine = (s) => String(s).replace(/\s*\r?\n\s*/g, ' | ')
const r3 = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function check(name, ok, data = {}) {
  results.push({ name, ok: ok === true })
  console.log(`check ${name} ${ok === true ? 'PASS' : 'FAIL'} ${JSON.stringify(data)}`)
}

/** Per-axis |a - b| (rounded) and whether every axis is within tol. */
function near3(a, b, tol) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 3 || b.length !== 3) return { ok: false, d: null }
  const d = [0, 1, 2].map((i) => r3(Math.abs(a[i] - b[i])))
  return { ok: d.every((x) => Number.isFinite(x) && x <= tol), d }
}

// ---- static server (D-020: base './', appType 'mpa' -> a missing file is a real 404, never an HTML fallback) ----

const served = [] // { t, path, status, bytes }

function startServer() {
  const prefix = `/${base}`
  const server = createServer((req, res) => {
    const record = (status, bytes) => served.push({ t: Date.now(), path: req.url ?? '', status, bytes })
    const plain = (status, text) => {
      const body = Buffer.from(text + '\n')
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' })
      res.end(req.method === 'HEAD' ? undefined : body)
      record(status, body.length)
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      plain(405, 'method not allowed')
      return
    }
    let pathname
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', `http://${pageHost}`).pathname)
    } catch {
      plain(400, 'bad request')
      return
    }
    if (prefix !== '/' && pathname === prefix.slice(0, -1)) {
      res.writeHead(301, { Location: prefix, 'Content-Length': 0, 'Cache-Control': 'no-store' })
      res.end()
      record(301, 0)
      return
    }
    if (!pathname.startsWith(prefix)) {
      plain(404, 'not found')
      return
    }
    let rel = pathname.slice(prefix.length)
    if (rel === '' || rel.endsWith('/')) rel += 'index.html'
    const parts = rel.split('/')
    if (parts.some((p) => p === '' || p === '.' || p === '..' || /[\\:\0]/.test(p))) {
      plain(404, 'not found')
      return
    }
    const file = resolve(root, ...parts)
    let st = null
    try {
      st = file.startsWith(root + sep) ? statSync(file) : null
    } catch {
      st = null
    }
    // directories (and anything that is not a regular file) are 404: no listing
    if (st == null || !st.isFile()) {
      plain(404, 'not found')
      return
    }
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).slice(1).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    record(200, req.method === 'HEAD' ? 0 : st.size)
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(file)
      .on('error', () => res.destroy())
      .pipe(res)
  })
  return new Promise((ok, fail) => {
    server.once('error', fail)
    server.listen(opts.port, '127.0.0.1', () => ok(server))
  })
}

/** Bytes the server sent up to time t (first load = until the first MENU, §7 row 21). */
function servedUntil(t) {
  const list = served.filter((s) => s.t <= t)
  const bytes = list.reduce((a, s) => a + s.bytes, 0)
  return { requests: list.length, bytes, mb: Math.round((bytes / MB) * 100) / 100 }
}

// ---- browser and page listeners --------------------------------------------------------------------------------

const counters = { pageErrors: 0, consoleErrors: 0, requestFailed: 0, abortedByReload: 0, httpErrors: 0, foreign: 0 }
let reloading = false
let browser = null
let server = null
const contexts = []

function attachListeners(page) {
  page.on('pageerror', (err) => {
    counters.pageErrors++
    console.log(`[page error] ${oneLine(err.message)}`)
    for (const line of String(err.stack ?? '').split(/\r?\n/).slice(1, 6)) console.log(`    ${line.trim()}`)
  })
  page.on('crash', () => {
    counters.pageErrors++
    console.log('[page error] page crashed')
  })
  page.on('console', (msg) => {
    const type = msg.type()
    const text = oneLine(msg.text())
    if (type === 'error') {
      counters.consoleErrors++
      console.log(`[error] ${text}`)
    } else if (type === 'warning') {
      console.log(`[warn] ${text}`)
    } else {
      console.log(`[${type}] ${text}`)
    }
  })
  page.on('requestfailed', (req) => {
    const err = req.failure()?.errorText ?? ''
    // an intentional page.reload() aborts loads still in flight; that is the navigation, not a missing asset
    if (reloading && /ERR_ABORTED/.test(err)) {
      counters.abortedByReload++
      console.log(`request aborted by reload ${req.url()}`)
      return
    }
    counters.requestFailed++
    console.log(`[request failed] ${req.url()} ${err}`)
  })
  page.on('response', (res) => {
    if (res.status() >= 400) {
      counters.httpErrors++
      console.log(`[http ${res.status()}] ${res.url()}`)
    }
  })
  page.on('request', (req) => {
    let u = null
    try {
      u = new URL(req.url())
    } catch {
      return
    }
    if (!/^(https?|wss?):$/.test(u.protocol)) return
    if (u.host !== pageHost) {
      counters.foreign++
      console.log(`foreign-request ${req.url()}`)
    }
  })
}

async function newPage() {
  const context = await browser.newContext({
    viewport: opts.viewport,
    ...(harPath ? { recordHar: { path: harPath, content: 'omit', mode: 'full' } } : {}),
  })
  contexts.push(context)
  const page = await context.newPage()
  attachListeners(page)
  return { context, page }
}

// ---- in-page observation (read-only; one evaluate = one frame, so getter reads inside it are consistent) ---------

/** Reads __game keys: the getter object first, snapshot() when a key is missing on it (ref/02 §window.__game). */
async function readGame(page, keys) {
  return page.evaluate((keys) => {
    const g = window.__game
    const out = { present: g != null }
    let snap = null
    for (const k of keys) {
      let v = g?.[k]
      if (v === undefined && typeof g?.snapshot === 'function') {
        snap ??= g.snapshot()
        v = snap[k]
      }
      out[k] = v ?? null
    }
    const c = document.querySelector('canvas')
    out.locked = c != null && document.pointerLockElement === c
    return out
  }, keys)
}

/** Waits (per frame) for state === target and, when locked is given, the pointer-lock condition. */
async function waitState(page, target, { timeoutMs = 5000, locked = null } = {}) {
  return page.evaluate(
    async ({ target, timeoutMs, locked }) => {
      const tick = () =>
        new Promise((r) => {
          const t = setTimeout(r, 100)
          requestAnimationFrame(() => {
            clearTimeout(t)
            r()
          })
        })
      const g = () => window.__game
      const read = (k) => {
        const v = g()?.[k]
        return v !== undefined || typeof g()?.snapshot !== 'function' ? v : g().snapshot()[k]
      }
      const t0 = performance.now()
      for (;;) {
        const state = read('state') ?? null
        const c = document.querySelector('canvas')
        const isLocked = c != null && document.pointerLockElement === c
        if (state === target && (locked == null || isLocked === locked)) {
          return { ok: true, ms: Math.round(performance.now() - t0), state, locked: isLocked, frame: read('frame'), player: read('player'), run: read('run'), records: read('records') ?? null }
        }
        if ((state === 'ERROR' && target !== 'ERROR') || performance.now() - t0 > timeoutMs) {
          return { ok: false, ms: Math.round(performance.now() - t0), state, locked: isLocked, hint: document.querySelector('.hint')?.textContent ?? null, alert: document.querySelector('[role=alert]')?.textContent ?? null }
        }
        await tick()
      }
    },
    { target, timeoutMs, locked },
  )
}

/** PLAYING, groundedRaw and the feet unchanged (±eps per axis) for stillMs. */
async function waitStill(page, { stillMs = 300, timeoutMs = 10000, eps = 0.001 } = {}) {
  return page.evaluate(
    async ({ stillMs, timeoutMs, eps }) => {
      const tick = () =>
        new Promise((r) => {
          const t = setTimeout(r, 100)
          requestAnimationFrame(() => {
            clearTimeout(t)
            r()
          })
        })
      const g = () => window.__game
      const read = (k) => {
        const v = g()?.[k]
        return v !== undefined || typeof g()?.snapshot !== 'function' ? v : g().snapshot()[k]
      }
      const t0 = performance.now()
      let ref = null
      let since = 0
      for (;;) {
        const now = performance.now()
        const state = read('state')
        const p = read('player')
        if (state === 'PLAYING' && p?.groundedRaw === true) {
          const moved = ref == null || [0, 1, 2].some((i) => Math.abs(p.pos[i] - ref[i]) > eps)
          if (moved) {
            ref = p.pos
            since = now
          } else if (now - since >= stillMs) {
            return { ok: true, ms: Math.round(now - t0), stillMs: Math.round(now - since), player: p, run: read('run') }
          }
        } else {
          ref = null
        }
        if (now - t0 > timeoutMs) return { ok: false, ms: Math.round(now - t0), state, player: p ?? null, run: read('run') ?? null }
        await tick()
      }
    },
    { stillMs, timeoutMs, eps },
  )
}

/** Not grounded and the feet at least rise m above groundY. */
async function waitAirborne(page, groundY, rise, timeoutMs) {
  return page.evaluate(
    async ({ groundY, rise, timeoutMs }) => {
      const g = () => window.__game
      const read = (k) => {
        const v = g()?.[k]
        return v !== undefined || typeof g()?.snapshot !== 'function' ? v : g().snapshot()[k]
      }
      const t0 = performance.now()
      for (;;) {
        const p = read('player')
        if (p != null && p.groundedRaw === false && p.pos[1] >= groundY + rise) return { ok: true, ms: Math.round(performance.now() - t0), player: p }
        if (performance.now() - t0 > timeoutMs) return { ok: false, ms: Math.round(performance.now() - t0), player: p ?? null }
        await new Promise((r) => requestAnimationFrame(r))
      }
    },
    { groundY, rise, timeoutMs },
  )
}

async function readSave(page) {
  const raw = await page.evaluate(() => {
    try {
      return localStorage.getItem('va.run.v1')
    } catch {
      return null
    }
  })
  let parsed = null
  try {
    parsed = raw == null ? null : JSON.parse(raw)
  } catch {
    parsed = null
  }
  return { raw, parsed }
}

function saveValid(s) {
  const ls = s?.lastSafe
  return s != null && s.v === 1 && Array.isArray(ls) && ls.length === 3 && ls.every(Number.isFinite) && Number.isFinite(s.timerMs)
}

/** Same probe as vitexec/probes/env.ts (ref/06 §Probe G0): renderer string via WEBGL_debug_renderer_info. */
async function logRenderer(page) {
  const env = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2')
    if (!gl) return { ua: navigator.userAgent, webgl2: false }
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)
    return { ua: navigator.userAgent, renderer, vendor, dpr: devicePixelRatio, ext: !!ext }
  })
  console.log('env ' + JSON.stringify(env))
  if (/swiftshader|llvmpipe/i.test(String(env.renderer))) console.log('warn software renderer (not performance data)')
  return env
}

// ---- trusted input ---------------------------------------------------------------------------------------------

const sel = (id) => `[data-testid="${id}"]`

async function isVisible(page, id, timeoutMs) {
  try {
    await page.locator(sel(id)).first().waitFor({ state: 'visible', timeout: timeoutMs })
    return true
  } catch {
    return false
  }
}

/** Real click (page.mouse) at the centre of the element; refuses when another element covers that point. */
async function clickTestId(page, id, timeoutMs = 5000) {
  const loc = page.locator(sel(id)).first()
  await loc.waitFor({ state: 'visible', timeout: timeoutMs })
  const box = await loc.boundingBox()
  if (box == null) throw new Error(`no box for ${sel(id)}`)
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const cover = await page.evaluate(
    ({ x, y, s }) => {
      const el = document.elementFromPoint(x, y)
      return el != null && el.closest(s) != null ? null : (el?.outerHTML.slice(0, 120) ?? 'nothing')
    },
    { x, y, s: sel(id) },
  )
  if (cover != null) throw new Error(`${sel(id)} is covered at its centre by ${cover}`)
  await page.mouse.move(x, y)
  await page.mouse.click(x, y, { delay: 40 })
}

/**
 * Clicks seq (all but the last only when visible), then waits for locked PLAYING (D-004: PLAYING only after
 * pointerlockchange -> canvas). A rejected lock leaves the "Click again" hint: one more try like a person, after
 * 400 ms, with retrySeq.
 */
async function enter(page, seq, retrySeq = seq) {
  const attempts = []
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(400)
    const ids = attempt === 0 ? seq : retrySeq
    try {
      for (let i = 0; i < ids.length; i++) {
        if (i < ids.length - 1 && !(await isVisible(page, ids[i], 300))) continue
        await clickTestId(page, ids[i])
      }
    } catch (err) {
      attempts.push({ error: oneLine(err.message) })
      continue
    }
    const s = await waitState(page, 'PLAYING', { timeoutMs: 3000, locked: true })
    attempts.push({ ok: s.ok, ms: s.ms, state: s.state, locked: s.locked, hint: s.hint ?? null })
    if (s.ok) return { ...s, retries: attempt, attempts }
  }
  return { ok: false, retries: attempts.length - 1, attempts }
}

async function walk(page, ms, code = 'KeyW') {
  await page.keyboard.down(code)
  await sleep(ms)
  await page.keyboard.up(code)
}

/** Seeds rawInput:false right before the first Play click (D-040: raw-input lock also receives the machine's mouse). */
async function seedNoRawInput(page) {
  await page.evaluate(() => {
    let stored = {}
    try {
      stored = JSON.parse(localStorage.getItem('va.settings.v1') ?? '{}') ?? {}
    } catch {
      stored = {}
    }
    localStorage.setItem('va.settings.v1', JSON.stringify({ ...stored, v: 1, rawInput: false }))
  })
  console.log('synthetic: settings-seed ' + JSON.stringify({ rawInput: false, reason: 'D-040 test isolation' }))
}

// ---- shared steps ----------------------------------------------------------------------------------------------

let firstMenuAt = null

/** Navigation -> canvas, >=60 app frames, worldReady (timed from navigation start), then MENU. */
async function loadToMenu(page) {
  await page.goto(url, { waitUntil: 'load', timeout: 60000 })
  const load = await page.evaluate(
    async ({ deadlineMs, frames }) => {
      const tick = () =>
        new Promise((r) => {
          const t = setTimeout(r, 100)
          requestAnimationFrame(() => {
            clearTimeout(t)
            r()
          })
        })
      const g = () => window.__game
      const read = (k) => {
        const v = g()?.[k]
        return v !== undefined || typeof g()?.snapshot !== 'function' ? v : g().snapshot()[k]
      }
      let tCanvas = null
      let tWorldReady = null
      let tFrames = null
      let frame = 0
      let state = null
      for (;;) {
        const now = performance.now() // counts from navigation start
        if (tCanvas == null && document.querySelector('canvas') != null) tCanvas = now
        state = read('state') ?? null
        frame = read('frame') ?? 0
        if (tWorldReady == null && read('worldReady') === true) tWorldReady = now
        if (tFrames == null && frame >= frames) tFrames = now
        if (state === 'ERROR' || (tCanvas != null && tWorldReady != null && tFrames != null) || now > deadlineMs) break
        await tick()
      }
      const ms = (v) => (v == null ? null : Math.round(v))
      return {
        tCanvasMs: ms(tCanvas),
        tWorldReadyMs: ms(tWorldReady),
        tFramesMs: ms(tFrames),
        frame,
        state,
        canvases: document.querySelectorAll('canvas').length,
        gamePresent: g() != null,
        alert: document.querySelector('[role=alert]')?.textContent ?? null,
      }
    },
    { deadlineMs: opts.loadDeadlineS * 1000, frames: LIMITS.frames },
  )
  console.log('load ' + JSON.stringify(load))
  const menu = await waitState(page, 'MENU', { timeoutMs: 90000 })
  if (menu.ok && firstMenuAt == null) firstMenuAt = Date.now()
  console.log('menu ' + JSON.stringify({ ok: menu.ok, ms: menu.ms, state: menu.state, alert: menu.alert ?? null }))
  return { load, menu }
}

function loadChecks(load, menu) {
  const deadline = opts.loadDeadlineS * 1000
  const within = (t) => t != null && t <= deadline
  check('canvas', load.tCanvasMs != null && within(load.tCanvasMs), { tCanvasMs: load.tCanvasMs, canvases: load.canvases, deadlineMs: deadline })
  check('frames', load.tFramesMs != null && within(load.tFramesMs), { frame: load.frame, min: LIMITS.frames, tFramesMs: load.tFramesMs, deadlineMs: deadline })
  check('world-ready', load.tWorldReadyMs != null && within(load.tWorldReadyMs), { tWorldReadyMs: load.tWorldReadyMs, deadlineMs: deadline })
  check('menu', menu.ok, { ms: menu.ms, state: menu.state, alert: menu.alert ?? null })
}

function firstLoad() {
  return firstMenuAt == null ? null : servedUntil(firstMenuAt)
}

/** Play from MENU: seed (D-040), real click, locked PLAYING. */
async function playFromMenu(page) {
  await seedNoRawInput(page)
  const s = await enter(page, ['play'])
  check('play', s.ok, { retries: s.retries, attempts: s.attempts })
  return s
}

/** One confirmed restart through real input: P -> pause menu -> Restart -> dialog -> confirm -> locked PLAYING. */
async function confirmedRestart(page, i) {
  await page.keyboard.press('KeyP', { delay: 80 })
  const paused = await waitState(page, 'PAUSED', { timeoutMs: 2000 })
  if (!paused.ok) return { i, paused: false, state: paused.state }
  await sleep(400) // lock released by the pause; re-lock after ~200 ms works under Playwright (ref/06)
  try {
    await clickTestId(page, 'restart')
  } catch (err) {
    return { i, paused: true, dialog: false, error: oneLine(err.message) }
  }
  const dialog = await isVisible(page, 'confirm-restart', 2000)
  const atDialog = await readGame(page, ['state'])
  if (!dialog) return { i, paused: true, dialog: false, state: atDialog.state }
  const s = await enter(page, ['confirm-restart'], ['restart', 'confirm-restart'])
  return {
    i,
    paused: true,
    dialog: true,
    pausedAtDialog: atDialog.state === 'PAUSED' && !atDialog.locked,
    entered: s.ok,
    retries: s.retries,
    timerMs: s.run?.timerMs ?? null,
    pos: s.player?.pos ?? null,
  }
}

/** n confirmed restarts with a short walk in each new run; checks that every one entered PLAYING. */
async function restarts(page, n) {
  const before = await readGame(page, ['records'])
  const rows = []
  for (let i = 1; i <= n; i++) {
    const row = await confirmedRestart(page, i)
    rows.push(row)
    console.log('restart ' + JSON.stringify(row))
    if (!row.entered) break
    await walk(page, 400)
    await sleep(300)
  }
  const after = await readGame(page, ['records'])
  const count0 = before.records?.restartCount
  const count1 = after.records?.restartCount
  const counted = Number.isFinite(count0) && Number.isFinite(count1) ? count1 - count0 : null
  const ok = rows.length === n && rows.every((r) => r.entered && r.dialog && r.pausedAtDialog) && (counted == null || counted === n)
  check('restarts', ok, { n, done: rows.filter((r) => r.entered).length, restartCountDelta: counted, retries: rows.reduce((a, r) => a + (r.retries ?? 0), 0) })
  return ok
}

// ---- scenarios -------------------------------------------------------------------------------------------------

function sumValues(rec) {
  return Object.values(rec ?? {}).reduce((a, v) => a + (Number.isFinite(v) ? v : 0), 0)
}

/** dist/ file budget (§7 row 21, D-020): <=1000 files, relative path <=240 chars, largest <=10 MB unless excepted. */
function distChecks() {
  const files = []
  const stack = ['']
  while (stack.length > 0) {
    const rel = stack.pop()
    for (const d of readdirSync(rel === '' ? root : resolve(root, rel), { withFileTypes: true })) {
      const r = rel === '' ? d.name : `${rel}/${d.name}`
      if (d.isDirectory()) stack.push(r)
      else files.push({ rel: r, bytes: statSync(resolve(root, r)).size })
    }
  }
  const excepted = (f) => opts.sizeExceptions.some((e) => e === f.rel || e === basename(f.rel))
  const longest = files.reduce((a, f) => (f.rel.length > a.length ? f.rel : a), '')
  const tooLong = files.filter((f) => f.rel.length > LIMITS.pathChars).map((f) => f.rel)
  const largest = files.reduce((a, f) => (a == null || f.bytes > a.bytes ? f : a), null)
  const oversize = files.filter((f) => f.bytes > LIMITS.fileBytes)
  const oversizeNotExcepted = oversize.filter((f) => !excepted(f))
  const total = files.reduce((a, f) => a + f.bytes, 0)
  check('dist-files', files.length <= LIMITS.distFiles, { files: files.length, max: LIMITS.distFiles, totalMb: Math.round((total / MB) * 100) / 100 })
  check('dist-path-length', tooLong.length === 0, { longest: longest.length, path: longest, max: LIMITS.pathChars, over: tooLong.slice(0, 5) })
  check('dist-largest-file', oversizeNotExcepted.length === 0, {
    largest: largest == null ? null : { path: largest.rel, bytes: largest.bytes },
    maxBytes: LIMITS.fileBytes,
    oversize: oversize.map((f) => ({ path: f.rel, bytes: f.bytes, excepted: excepted(f) })),
    exceptions: opts.sizeExceptions,
  })
}

/** TEST-01 basic in prod (and TEST-21's runtime part): load, frames, worldReady, Play, BVH numbers. */
async function scenarioLoad(withBudgets) {
  const { page } = await newPage()
  const { load, menu } = await loadToMenu(page)
  await logRenderer(page)
  loadChecks(load, menu)
  if (!menu.ok) return
  await playFromMenu(page)
  // 60 more app frames in PLAYING with no runner error lines (checked at the end)
  const f0 = (await readGame(page, ['frame'])).frame ?? 0
  const f = await page.evaluate(
    async ({ f0, n }) => {
      const t0 = performance.now()
      for (;;) {
        const g = window.__game
        const frame = g?.frame ?? g?.snapshot?.().frame ?? 0
        if (frame >= f0 + n) return { ok: true, frames: frame - f0 }
        if (performance.now() - t0 > 10000) return { ok: false, frames: frame - f0 }
        await new Promise((r) => requestAnimationFrame(r))
      }
    },
    { f0, n: LIMITS.frames },
  )
  check('frames-playing', f.ok, { frames: f.frames, min: LIMITS.frames })
  const g = await readGame(page, ['bvh', 'model', 'render'])
  const bvhMs = Math.round(sumValues(g.bvh?.buildMs) * 100) / 100
  const bvhTris = sumValues(g.bvh?.tris)
  const bodies = Object.keys(g.bvh?.buildMs ?? {}).length
  console.log('bvh ' + JSON.stringify({ bodies, buildMs: bvhMs, tris: bvhTris }))
  console.log('render ' + JSON.stringify(g.render))
  const fl = firstLoad()
  console.log('first-load ' + JSON.stringify(fl))
  if (!withBudgets) return
  check('bvh-build-ms', bodies > 0 && bvhMs <= LIMITS.bvhMs, { sumMs: bvhMs, max: LIMITS.bvhMs, bodies })
  check('bvh-tris', bodies > 0 && bvhTris <= LIMITS.bvhTris, { sum: bvhTris, max: LIMITS.bvhTris, bodies })
  check('first-load', fl != null && fl.bytes <= LIMITS.firstLoadBytes, { ...fl, maxBytes: LIMITS.firstLoadBytes })
  distChecks()
}

/** TEST-18b: HAR of load + Play + 10 confirmed restarts, judged by scripts/har-check.mjs (D-020 rule, one copy). */
async function scenarioHar() {
  const { context, page } = await newPage()
  const { load, menu } = await loadToMenu(page)
  await logRenderer(page)
  loadChecks(load, menu)
  if (!menu.ok) return
  const p = await playFromMenu(page)
  if (!p.ok) return
  await walk(page, 600)
  await sleep(300)
  await restarts(page, LIMITS.restarts)
  console.log('first-load ' + JSON.stringify(firstLoad()))
  await context.close() // writes the HAR
  contexts.splice(contexts.indexOf(context), 1)
  const harCheck = fileURLToPath(new URL('./har-check.mjs', import.meta.url))
  const r = spawnSync(process.execPath, [harCheck, harPath, '--host', '127.0.0.1'], { encoding: 'utf8' })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.split(/\r?\n/).filter((l) => l !== '')
  for (const line of out) console.log(`har-check: ${line}`)
  const summaryLine = out.find((l) => l.startsWith('har {'))
  let summary = null
  try {
    summary = summaryLine ? JSON.parse(summaryLine.slice(4)) : null
  } catch {
    summary = null
  }
  check('har', r.status === 0 && summary?.pageHost === pageHost, { exit: r.status, har: harPath, ...(summary ?? {}) })
  check('foreign-requests-live', counters.foreign === 0, { foreign: counters.foreign })
}

/** TEST-27: renderer memory, programs, heap and Canvas identity across 10 confirmed restarts. */
async function scenarioMemory() {
  const { page } = await newPage()
  const { load, menu } = await loadToMenu(page)
  await logRenderer(page)
  loadChecks(load, menu)
  if (!menu.ok) return
  const p = await playFromMenu(page)
  if (!p.ok) return
  const settle = async () => {
    await walk(page, 400)
    await sleep(1500)
  }
  const heap = () =>
    page.evaluate(async () => {
      if (typeof window.gc !== 'function' || performance.memory == null) return null
      for (let i = 0; i < 3; i++) {
        window.gc()
        await new Promise((r) => setTimeout(r, 100))
      }
      return performance.memory.usedJSHeapSize
    })
  await settle()
  const canvas = await page.evaluateHandle(() => document.querySelector('canvas'))
  const heap0 = await heap()
  check('gc-available', heap0 != null, { args: '--js-flags=--expose-gc --enable-precise-memory-info' })
  const g0 = await readGame(page, ['render', 'model'])
  console.log('before restart 1 ' + JSON.stringify({ heap: heap0, render: g0.render, model: g0.model }))
  const ok = await restarts(page, LIMITS.restarts)
  if (!ok) return
  await settle()
  const heap1 = await heap()
  const g1 = await readGame(page, ['render', 'model'])
  console.log('after restart 10 ' + JSON.stringify({ heap: heap1, render: g1.render, model: g1.model }))
  const same = await page.evaluate((c) => ({ same: c === document.querySelector('canvas'), connected: c?.isConnected === true, canvases: document.querySelectorAll('canvas').length }), canvas)
  const d = (k) => (g1.render?.[k] ?? NaN) - (g0.render?.[k] ?? NaN)
  check('render-geometries', d('geometries') === 0, { before: g0.render?.geometries, after: g1.render?.geometries, delta: d('geometries') })
  check('render-textures', d('textures') === 0, { before: g0.render?.textures, after: g1.render?.textures, delta: d('textures') })
  check('render-programs', d('programs') === 0, { before: g0.render?.programs, after: g1.render?.programs })
  const heapDelta = heap0 != null && heap1 != null ? heap1 - heap0 : null
  check('heap-delta', heapDelta != null && heapDelta <= LIMITS.heapDeltaBytes, {
    before: heap0,
    after: heap1,
    deltaBytes: heapDelta,
    deltaMb: heapDelta == null ? null : Math.round((heapDelta / MB) * 100) / 100,
    maxBytes: LIMITS.heapDeltaBytes,
  })
  check('canvas-not-remounted', same.same && same.connected && g0.model?.uuid != null && g0.model?.uuid !== '' && g0.model?.uuid === g1.model?.uuid, {
    ...same,
    uuidBefore: g0.model?.uuid ?? null,
    uuidAfter: g1.model?.uuid ?? null,
  })
  await canvas.dispose()
}

/** TEST-30: pagehide save through page.reload(), Continue restore, airborne reload, New climb confirmation (D-009). */
async function scenarioSave() {
  const { page } = await newPage()
  const { load, menu } = await loadToMenu(page)
  await logRenderer(page)
  loadChecks(load, menu)
  if (!menu.ok) return
  const playVisible = await isVisible(page, 'play', 5000)
  const continueCount = await page.locator(sel('continue')).count()
  check('30-fresh-menu', playVisible && continueCount === 0, { play: playVisible, continueButtons: continueCount })
  const p = await playFromMenu(page)
  if (!p.ok) return
  const tol = LIMITS.restoreTolM

  // A. walk forward 1 s, stand still on static ground, reload (pagehide), Continue
  await walk(page, 1000)
  const still = await waitStill(page)
  check('30a-grounded-still', still.ok && still.player?.groundBody == null, { ms: still.ms, pos: still.player?.pos ?? null, groundBody: still.player?.groundBody ?? null, state: still.state ?? 'PLAYING' })
  if (!still.ok) return
  const saveBeforeReload = await readSave(page)
  const tPre = Date.now()
  const pre = await readGame(page, ['run', 'player'])
  console.log('prod: reload ' + JSON.stringify({ case: 'grounded static', pos: pre.player?.pos, timerMs: pre.run?.timerMs, saveBeforeReload: saveBeforeReload.raw != null }))
  reloading = true
  await page.reload({ waitUntil: 'load', timeout: 60000 })
  reloading = false
  const tReloaded = Date.now()
  const menuA = await waitState(page, 'MENU', { timeoutMs: 90000 })
  check('30a-menu-after-reload', menuA.ok, { ms: menuA.ms, state: menuA.state })
  if (!menuA.ok) return
  const saveA = await readSave(page)
  const s = saveA.parsed
  check('30a-save-written', saveValid(s), { raw: saveA.raw == null ? null : saveA.raw.slice(0, 400) })
  if (!saveValid(s)) return
  const lsNear = near3(s.lastSafe, pre.player?.pos, tol)
  check('30a-save-lastSafe', lsNear.ok, { lastSafe: s.lastSafe, posBeforeReload: pre.player?.pos ?? null, d: lsNear.d, tol })
  const tMin = (pre.run?.timerMs ?? NaN) - LIMITS.timerTolMs
  const tMax = (pre.run?.timerMs ?? NaN) + (tReloaded - tPre) + LIMITS.timerTolMs
  check('30a-save-timer', s.timerMs >= tMin && s.timerMs <= tMax, { saved: s.timerMs, beforeReload: pre.run?.timerMs ?? null, range: [tMin, tMax] })
  const sameCounters = (run) =>
    run != null && run.killPlaneRespawns === s.killPlaneRespawns && run.bigFalls === s.bigFalls && Math.abs((run.metersLost ?? NaN) - s.metersLost) <= 0.01
  check('30a-save-counters', sameCounters(pre.run), {
    saved: { killPlaneRespawns: s.killPlaneRespawns, bigFalls: s.bigFalls, metersLost: s.metersLost },
    beforeReload: pre.run == null ? null : { killPlaneRespawns: pre.run.killPlaneRespawns, bigFalls: pre.run.bigFalls, metersLost: pre.run.metersLost },
  })
  const hasContinue = await isVisible(page, 'continue', 5000)
  const label = hasContinue ? ((await page.locator(sel('continue')).first().textContent()) ?? '') : null
  const mmss = label == null ? null : /(\d{2,}):(\d{2})/.exec(label)
  const shownS = mmss ? Number(mmss[1]) * 60 + Number(mmss[2]) : null
  check('30a-continue-label', label != null && label.includes(' m · ') && shownS != null && Math.abs(shownS - s.timerMs / 1000) <= 1, { text: label, savedTimerMs: s.timerMs })
  if (!hasContinue) return
  const cont = await enter(page, ['continue'])
  check('30a-continue-playing', cont.ok, { retries: cont.retries, attempts: cont.attempts })
  if (!cont.ok) return
  const settled = await waitStill(page, { timeoutMs: 5000 })
  const pos = settled.player?.pos ?? null
  const restore = near3(pos, s.lastSafe, tol)
  check('30a-restore-position', settled.ok && restore.ok, { lastSafe: s.lastSafe, entryPos: cont.player?.pos ?? null, settledPos: pos, d: restore.d, tol })
  check('30a-restore-timer', Number.isFinite(cont.run?.timerMs) && Math.abs(cont.run.timerMs - s.timerMs) <= LIMITS.timerTolMs, { saved: s.timerMs, atContinue: cont.run?.timerMs ?? null, afterSettle: settled.run?.timerMs ?? null, tolMs: LIMITS.timerTolMs })
  check('30a-restore-counters', sameCounters(cont.run), {
    saved: { killPlaneRespawns: s.killPlaneRespawns, bigFalls: s.bigFalls, metersLost: s.metersLost },
    atContinue: cont.run == null ? null : { killPlaneRespawns: cont.run.killPlaneRespawns, bigFalls: cont.run.bigFalls, metersLost: cont.run.metersLost },
  })
  if (!settled.ok) return

  // B. jump in place and reload while airborne: the save keeps the last grounded position
  const groundPos = settled.player.pos
  await page.keyboard.press('Space', { delay: 80 })
  const air = await waitAirborne(page, groundPos[1], 0.2, 2000)
  check('30b-airborne', air.ok, { groundY: groundPos[1], pos: air.player?.pos ?? null, groundedRaw: air.player?.groundedRaw ?? null })
  if (!air.ok) return
  console.log('prod: reload ' + JSON.stringify({ case: 'airborne', pos: air.player.pos }))
  reloading = true
  await page.reload({ waitUntil: 'load', timeout: 60000 })
  reloading = false
  const menuB = await waitState(page, 'MENU', { timeoutMs: 90000 })
  check('30b-menu-after-reload', menuB.ok, { ms: menuB.ms, state: menuB.state })
  if (!menuB.ok) return
  const saveB = await readSave(page)
  const sb = saveB.parsed
  const dy = saveValid(sb) ? r3(Math.abs(sb.lastSafe[1] - groundPos[1])) : null
  check('30b-save-not-airborne', saveValid(sb) && dy <= tol, { lastSafe: sb?.lastSafe ?? null, lastGroundedPos: groundPos, airbornePos: air.player.pos, dy, tol })

  // C. New climb with a save present asks first; confirming starts a new run and drops the old save
  const contB = await isVisible(page, 'continue', 5000)
  check('30c-continue-offered', contB, {})
  await clickTestId(page, 'new-climb')
  const dialog = await isVisible(page, 'confirm-new-climb', 2000)
  await sleep(300)
  const mid = await readGame(page, ['state'])
  const saveMid = await readSave(page)
  check('30c-new-climb-confirmation', dialog && mid.state === 'MENU' && !mid.locked && saveMid.raw === saveB.raw, { dialog, state: mid.state, locked: mid.locked, saveKept: saveMid.raw === saveB.raw })
  if (!dialog) return
  const nc = await enter(page, ['confirm-new-climb'], ['new-climb', 'confirm-new-climb'])
  check('30c-new-climb-playing', nc.ok, { retries: nc.retries, attempts: nc.attempts })
  if (!nc.ok) return
  const spawnNear = near3(nc.player?.pos, [0, 0, 0], tol) // D-007: spawn feet at (0, 0, 0)
  check('30c-new-climb-run', nc.run?.timerMs === 0 && spawnNear.ok, { timerMs: nc.run?.timerMs ?? null, heightM: nc.run?.heightM ?? null, pos: nc.player?.pos ?? null, d: spawnNear.d })
  const saveC = await readSave(page)
  const dropped = saveC.raw == null || (saveC.parsed?.savedAt !== sb?.savedAt && saveC.parsed?.timerMs === 0)
  check('30c-old-save-removed', dropped, { save: saveC.raw == null ? null : saveC.raw.slice(0, 200) })
}

/** TEST-22 numbers from the production build: first-load bytes and spawn frame time (reported, not judged). */
async function scenarioPerf() {
  const { page } = await newPage()
  const { load, menu } = await loadToMenu(page)
  const env = await logRenderer(page)
  loadChecks(load, menu)
  if (!menu.ok) return
  const p = await playFromMenu(page)
  if (!p.ok) return
  await sleep(2000)
  const perf = await page.evaluate(async (seconds) => {
    const ts = []
    await new Promise((done) => {
      let t0 = null
      const f = (t) => {
        t0 ??= t
        ts.push(t)
        if (t - t0 >= seconds * 1000) done()
        else requestAnimationFrame(f)
      }
      requestAnimationFrame(f)
    })
    const d = []
    for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1])
    d.sort((a, b) => a - b)
    const q = (x) => (d.length === 0 ? null : Math.round(d[Math.min(d.length - 1, Math.floor(x * d.length))] * 100) / 100)
    const c = document.querySelector('canvas')
    return { samples: d.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: q(1), canvas: c ? [c.width, c.height] : null, dpr: devicePixelRatio }
  }, opts.seconds)
  const g = await readGame(page, ['render', 'state'])
  console.log('perf ' + JSON.stringify({ build: 'prod', where: 'spawn', seconds: opts.seconds, renderer: env.renderer ?? null, ...perf, render: g.render, state: g.state }))
  console.log('first-load ' + JSON.stringify(firstLoad()))
  check('frametime-sampled', perf.samples >= 30 && g.state === 'PLAYING', { samples: perf.samples, state: g.state })
}

// ---- main ------------------------------------------------------------------------------------------------------

let finished = false

async function finish(exception) {
  if (finished) return
  finished = true
  if (exception != null) check('exception', false, { error: oneLine(exception?.stack ?? exception) })
  for (const c of contexts.splice(0)) await c.close().catch(() => {})
  await browser?.close().catch(() => {})
  if (server) {
    server.closeAllConnections?.()
    await new Promise((r) => server.close(() => r()))
  }
  const failed = results.filter((r) => !r.ok).map((r) => r.name)
  const ok = failed.length === 0 && results.length > 0
  console.log('summary ' + JSON.stringify({ checks: results.length, failed, served: served.length, ...counters }))
  console.log(`# smoke-dist ${opts.test} ${ok ? 'PASS' : 'FAIL'}`)
  process.exit(ok ? 0 : 1)
}

const watchdog = setTimeout(() => {
  check('timeout', false, { seconds: opts.timeoutS })
  void finish(null)
}, opts.timeoutS * 1000)

async function main() {
  let version = 'unknown'
  try {
    version = createRequire(import.meta.url)('playwright/package.json').version
  } catch {
    // not fatal: the version is only logged
  }
  server = await startServer()
  const args = [...opts.browserArgs]
  if (opts.test === '27') args.push('--js-flags=--expose-gc', '--enable-precise-memory-info')
  console.log('# smoke-dist ' + JSON.stringify({ test: opts.test, what: TESTS[opts.test], url, dist: root, playwright: version, headless: !opts.headed, args, viewport: opts.viewport }))
  browser = await chromium.launch({ channel: 'chromium', headless: !opts.headed, args })
  console.log('browser ' + JSON.stringify({ version: browser.version() }))
  if (opts.test === '01') await scenarioLoad(false)
  else if (opts.test === '21') await scenarioLoad(true)
  else if (opts.test === '18b') await scenarioHar()
  else if (opts.test === '27') await scenarioMemory()
  else if (opts.test === '30') await scenarioSave()
  else if (opts.test === '22') await scenarioPerf()
  check('page-errors', counters.pageErrors === 0, { pageErrors: counters.pageErrors })
  check('console-errors', counters.consoleErrors === 0, { consoleErrors: counters.consoleErrors })
  check('requests-failed', counters.requestFailed === 0, { failed: counters.requestFailed, abortedByReload: counters.abortedByReload })
  check('http-errors', counters.httpErrors === 0, { responses4xx5xx: counters.httpErrors })
}

main()
  .then(() => {
    clearTimeout(watchdog)
    return finish(null)
  })
  .catch((err) => {
    clearTimeout(watchdog)
    return finish(err)
  })
