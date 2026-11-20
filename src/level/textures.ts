// Procedural stylized Genshin Impact / Studio Ghibli 512px CanvasTextures + bump maps (cached once per surface kind).
// Zero external image files; safe in headless/Node environments where document is unavailable (returns null maps).
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

export type SurfaceStyle = 'cliff' | 'stone' | 'facade' | 'metal' | 'moss' | 'marble' | 'concrete' | 'hazard' | 'trim'

type TexturePair = { map: CanvasTexture; bumpMap: CanvasTexture }
const cache = new Map<string, TexturePair>()

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeCanvas(size = 512): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d')
  if (!g) return null
  return [c, g]
}

function finalize(c: HTMLCanvasElement, repeatX: number, repeatY: number, isColor: boolean): CanvasTexture {
  const t = new CanvasTexture(c)
  t.wrapS = RepeatWrapping
  t.wrapT = RepeatWrapping
  t.repeat.set(repeatX, repeatY)
  if (isColor) t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  t.needsUpdate = true
  return t
}

/** Generates a 512px stylized painterly color texture and matching height/bump map for a given surface style. */
export function getSurfaceTextures(style: SurfaceStyle): TexturePair | null {
  const existing = cache.get(style)
  if (existing) return existing
  const S = 512
  const col = makeCanvas(S)
  const bmp = makeCanvas(S)
  if (!col || !bmp) return null
  const [cc, cg] = col
  const [bc, bg] = bmp
  const rng = mulberry32(style.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7))

  // Neutral sunlit base so MeshStandardMaterial.color tints cleanly
  cg.fillStyle = '#eee8dc'
  cg.fillRect(0, 0, S, S)
  bg.fillStyle = '#808080'
  bg.fillRect(0, 0, S, S)

  if (style === 'cliff' || style === 'facade') {
    // Genshin Impact (Mondstadt / Liyue) painterly stratified limestone & sandstone cliff rock
    cg.fillStyle = '#e5d4ba'
    cg.fillRect(0, 0, S, S)
    // Horizontal sedimentary strata bands
    let y = 0
    while (y < S) {
      const bandH = 26 + rng() * 54
      const tone = 202 + Math.round((rng() - 0.5) * 34)
      const warmG = Math.max(0, tone - 14 + Math.round((rng() - 0.5) * 10))
      const warmB = Math.max(0, tone - 34 + Math.round((rng() - 0.5) * 12))
      cg.fillStyle = `rgb(${tone},${warmG},${warmB})`
      cg.fillRect(0, y, S, bandH)
      // Sunlit upper ridge highlight on each stratum
      cg.fillStyle = 'rgba(255,248,228,0.28)'
      cg.fillRect(0, y, S, 5)
      // Deep shadow under ledge
      cg.fillStyle = 'rgba(72,56,44,0.24)'
      cg.fillRect(0, y + bandH - 4, S, 4)

      const bv = Math.round(135 + (rng() - 0.5) * 55)
      bg.fillStyle = `rgb(${bv},${bv},${bv})`
      bg.fillRect(0, y, S, bandH)
      bg.fillStyle = '#383838'
      bg.fillRect(0, y + bandH - 4, S, 4)
      y += bandH
    }
    // Painterly angular rock facets
    for (let i = 0; i < 64; i++) {
      const fx = rng() * S
      const fy = rng() * S
      const fw = 28 + rng() * 76
      const fh = 18 + rng() * 48
      cg.fillStyle = rng() > 0.5 ? 'rgba(255,246,225,0.16)' : 'rgba(96,74,56,0.16)'
      cg.beginPath()
      cg.moveTo(fx, fy)
      cg.lineTo(fx + fw, fy + (rng() - 0.5) * 14)
      cg.lineTo(fx + fw * 0.85, fy + fh)
      cg.lineTo(fx - fw * 0.1, fy + fh * 0.9)
      cg.closePath()
      cg.fill()
    }
    // Vertical cliff fissures & cracks
    cg.strokeStyle = 'rgba(66,52,40,0.34)'
    bg.strokeStyle = '#242424'
    for (let i = 0; i < 18; i++) {
      let cx = rng() * S
      let cy = rng() * S * 0.4
      const segs = 4 + Math.floor(rng() * 5)
      cg.lineWidth = 1.5 + rng() * 2.2
      bg.lineWidth = 3
      cg.beginPath()
      bg.moveTo(cx, cy)
      bg.beginPath()
      bg.moveTo(cx, cy)
      for (let s = 0; s < segs; s++) {
        cx += (rng() - 0.5) * 28
        cy += 24 + rng() * 38
        cg.lineTo(cx, cy)
        bg.lineTo(cx, cy)
      }
      cg.stroke()
      bg.stroke()
    }
    // Subtle moss streaks tucked into top crevices
    for (let i = 0; i < 28; i++) {
      cg.fillStyle = 'rgba(104,158,88,0.28)'
      cg.beginPath()
      cg.ellipse(rng() * S, rng() * S * 0.35, 10 + rng() * 22, 4 + rng() * 8, (rng() - 0.5) * 0.4, 0, Math.PI * 2)
      cg.fill()
    }
  } else if (style === 'stone') {
    // Hand-painted warm sunlit ancient temple flagstones
    const rows = 6
    const rowH = S / rows
    for (let r = 0; r < rows; r++) {
      const cols = 6
      const off = (r % 2) * (S / cols / 2)
      const cellW = S / cols
      for (let i = -1; i <= cols; i++) {
        const x = i * cellW + off
        const y = r * rowH
        const shade = Math.round(224 + (rng() - 0.5) * 28)
        const warm = Math.round(shade - 7 + rng() * 7)
        cg.fillStyle = `rgb(${shade},${warm},${Math.max(0, warm - 14)})`
        cg.fillRect(x + 4, y + 4, cellW - 8, rowH - 8)
        cg.fillStyle = 'rgba(255,252,240,0.26)'
        cg.fillRect(x + 7, y + 7, cellW - 18, 14)
        if (rng() > 0.52) {
          cg.fillStyle = 'rgba(108,158,92,0.28)'
          cg.beginPath()
          cg.arc(x + 8, y + 8, 7 + rng() * 8, 0, Math.PI * 2)
          cg.fill()
        }
        const bVal = Math.round(145 + (rng() - 0.5) * 34)
        bg.fillStyle = `rgb(${bVal},${bVal},${bVal})`
        bg.fillRect(x + 4, y + 4, cellW - 8, rowH - 8)
      }
    }
    cg.strokeStyle = 'rgba(68,56,46,0.38)'
    cg.lineWidth = 4
    bg.strokeStyle = '#282828'
    bg.lineWidth = 5
    for (let r = 0; r <= rows; r++) {
      const y = r * rowH
      cg.beginPath(); cg.moveTo(0, y); cg.lineTo(S, y); cg.stroke()
      bg.beginPath(); bg.moveTo(0, y); bg.lineTo(S, y); bg.stroke()
    }
  } else if (style === 'metal') {
    // Weathered ancient bronze & brass sky-ruin plates with carved trim
    cg.fillStyle = '#dcd7c9'
    cg.fillRect(0, 0, S, S)
    for (let y = 0; y < S; y += 128) {
      for (let x = 0; x < S; x += 128) {
        const v = Math.round(210 + (rng() - 0.5) * 22)
        cg.fillStyle = `rgb(${v + 4},${v},${v - 8})`
        cg.fillRect(x + 4, y + 4, 120, 120)
        cg.strokeStyle = 'rgba(62,58,52,0.34)'
        cg.lineWidth = 3
        cg.strokeRect(x + 4, y + 4, 120, 120)
        cg.strokeStyle = 'rgba(245,210,126,0.3)'
        cg.lineWidth = 2
        cg.strokeRect(x + 14, y + 14, 100, 100)
        bg.fillStyle = '#9a9a9a'
        bg.fillRect(x + 4, y + 4, 120, 120)
      }
    }
  } else if (style === 'moss') {
    // Vibrant Genshin / Ghibli sunlit emerald grass & wildflowers
    cg.fillStyle = '#bdd9a8'
    cg.fillRect(0, 0, S, S)
    for (let i = 0; i < 820; i++) {
      const x = rng() * S
      const y = rng() * S
      const r = 6 + rng() * 20
      const gCol = Math.round(182 + rng() * 52)
      const rCol = Math.round(gCol - 34 + rng() * 20)
      const bCol = Math.round(gCol - 54 + rng() * 18)
      cg.fillStyle = `rgba(${rCol},${gCol},${bCol},0.36)`
      cg.beginPath()
      cg.ellipse(x, y, r, r * 0.5, rng() * Math.PI, 0, Math.PI * 2)
      cg.fill()
      const bv = Math.round(112 + rng() * 62)
      bg.fillStyle = `rgba(${bv},${bv},${bv},0.32)`
      bg.beginPath(); bg.arc(x, y, r * 0.55, 0, Math.PI * 2); bg.fill()
    }
    // Sunlit golden, cream, and sky-blue wildflowers
    for (let i = 0; i < 64; i++) {
      const pick = rng()
      cg.fillStyle =
        pick > 0.65 ? 'rgba(255,240,152,0.88)' : pick > 0.3 ? 'rgba(255,252,240,0.84)' : 'rgba(155,222,255,0.82)'
      cg.beginPath()
      cg.arc(rng() * S, rng() * S, 2.8 + rng() * 2.2, 0, Math.PI * 2)
      cg.fill()
    }
  } else if (style === 'marble') {
    // Celestia ivory-gold veined sanctuary marble with delicate teal rune flecks
    cg.fillStyle = '#f6f3ec'
    cg.fillRect(0, 0, S, S)
    for (let i = 0; i < 24; i++) {
      cg.strokeStyle = i % 3 === 0 ? 'rgba(226,192,114,0.44)' : 'rgba(154,186,204,0.32)'
      cg.lineWidth = 1.5 + rng() * 3
      cg.beginPath()
      let x = rng() * S
      let y = 0
      cg.moveTo(x, y)
      for (let s = 1; s <= 10; s++) {
        x += (rng() - 0.5) * 62
        y = s * (S / 10)
        cg.lineTo(x, y)
      }
      cg.stroke()
    }
    cg.strokeStyle = 'rgba(182,166,136,0.38)'
    cg.lineWidth = 3
    cg.strokeRect(4, 4, 248, 248)
    cg.strokeRect(260, 4, 248, 248)
    cg.strokeRect(4, 260, 248, 248)
    cg.strokeRect(260, 260, 248, 248)
    bg.strokeStyle = '#484848'
    bg.lineWidth = 3
    bg.strokeRect(4, 4, 248, 248)
    bg.strokeRect(260, 260, 248, 248)
  } else if (style === 'concrete') {
    // Sunlit ancient sanctuary courtyard tiles (warm carved stone, not grey urban concrete)
    cg.fillStyle = '#dfd8c8'
    cg.fillRect(0, 0, S, S)
    for (let y = 0; y < S; y += 64) {
      for (let x = 0; x < S; x += 64) {
        const v = Math.round(212 + (rng() - 0.5) * 18)
        cg.fillStyle = `rgb(${v},${v - 4},${v - 12})`
        cg.fillRect(x + 2, y + 2, 60, 60)
      }
    }
    for (let i = 0; i < 300; i++) {
      const bv = Math.round(110 + rng() * 48)
      bg.fillStyle = `rgba(${bv},${bv},${bv},0.3)`
      bg.fillRect(rng() * S, rng() * S, 6, 6)
    }
  } else if (style === 'hazard') {
    cg.fillStyle = '#ece6d8'
    cg.fillRect(0, 0, S, S)
    cg.fillStyle = 'rgba(0,0,0,0.12)'
    for (let i = -S; i < S * 2; i += 48) {
      cg.beginPath()
      cg.moveTo(i, 0); cg.lineTo(i + 24, 0); cg.lineTo(i - 96, S); cg.lineTo(i - 120, S)
      cg.closePath(); cg.fill()
    }
  } else {
    // Subtle hand-painted carved timber/stone trim grain
    for (let i = 0; i < 180; i++) {
      const v = Math.round(210 + rng() * 35)
      cg.fillStyle = `rgba(${v},${v - 4},${v - 10},0.32)`
      cg.fillRect(0, rng() * S, S, 3)
    }
  }

  const repeat = style === 'concrete' ? 24 : style === 'cliff' || style === 'facade' ? 2 : 1
  const pair: TexturePair = {
    map: finalize(cc, repeat, repeat, true),
    bumpMap: finalize(bc, repeat, repeat, false),
  }
  cache.set(style, pair)
  return pair
}
