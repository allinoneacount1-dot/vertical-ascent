// Procedural stylized Ghibli/anime CanvasTextures + bump maps (zero external files, cached once per surface kind).
// Safe in headless/Node environments where document is unavailable (returns null maps).
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

export type SurfaceStyle = 'stone' | 'facade' | 'metal' | 'moss' | 'marble' | 'concrete' | 'hazard' | 'trim'

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

function makeCanvas(size = 256): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
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

/** Generates a stylized painted color texture and matching height/bump map for a given surface style. */
export function getSurfaceTextures(style: SurfaceStyle): TexturePair | null {
  const existing = cache.get(style)
  if (existing) return existing
  const col = makeCanvas(256)
  const bmp = makeCanvas(256)
  if (!col || !bmp) return null
  const [cc, cg] = col
  const [bc, bg] = bmp
  const rng = mulberry32(style.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7))

  // Neutral white base so MeshStandardMaterial.color tints it cleanly
  cg.fillStyle = '#eceae4'
  cg.fillRect(0, 0, 256, 256)
  bg.fillStyle = '#808080'
  bg.fillRect(0, 0, 256, 256)

  if (style === 'stone') {
    // Hand-painted warm sunlit flagstones (Ghibli cobble)
    const rows = 4
    const rowH = 256 / rows
    for (let r = 0; r < rows; r++) {
      const cols = 4
      const off = (r % 2) * 32
      const cellW = 256 / cols
      for (let i = -1; i <= cols; i++) {
        const x = i * cellW + off
        const y = r * rowH
        const shade = Math.round(224 + (rng() - 0.5) * 26)
        const warm = Math.round(shade - 6 + rng() * 6)
        cg.fillStyle = `rgb(${shade},${warm},${Math.max(0, warm - 10)})`
        cg.fillRect(x + 3, y + 3, cellW - 6, rowH - 6)
        // painterly brush highlight
        cg.fillStyle = 'rgba(255,252,240,0.22)'
        cg.fillRect(x + 5, y + 5, cellW - 14, 10)
        // subtle mossy fleck on corners
        if (rng() > 0.55) {
          cg.fillStyle = 'rgba(116,154,102,0.26)'
          cg.beginPath()
          cg.arc(x + 6, y + 6, 5 + rng() * 5, 0, Math.PI * 2)
          cg.fill()
        }
        const bVal = Math.round(145 + (rng() - 0.5) * 30)
        bg.fillStyle = `rgb(${bVal},${bVal},${bVal})`
        bg.fillRect(x + 3, y + 3, cellW - 6, rowH - 6)
      }
    }
    // Mortar lines
    cg.strokeStyle = 'rgba(72,62,52,0.34)'
    cg.lineWidth = 3
    bg.strokeStyle = '#303030'
    bg.lineWidth = 4
    for (let r = 0; r <= rows; r++) {
      const y = r * rowH
      cg.beginPath(); cg.moveTo(0, y); cg.lineTo(256, y); cg.stroke()
      bg.beginPath(); bg.moveTo(0, y); bg.lineTo(256, y); bg.stroke()
    }
  } else if (style === 'facade') {
    // Stylized anime city building facade: warm plaster + sunlit/sky-reflected windows
    cg.fillStyle = '#e7e2d8'
    cg.fillRect(0, 0, 256, 256)
    // Soft horizontal floor bands
    for (let y = 0; y < 256; y += 32) {
      cg.fillStyle = y % 64 === 0 ? 'rgba(95,86,78,0.14)' : 'rgba(255,250,242,0.18)'
      cg.fillRect(0, y, 256, 4)
      bg.fillStyle = '#606060'
      bg.fillRect(0, y, 256, 3)
    }
    // Window grid
    for (let row = 0; row < 4; row++) {
      for (let colIdx = 0; colIdx < 4; colIdx++) {
        const wx = colIdx * 64 + 14
        const wy = row * 64 + 12
        const lit = rng() > 0.62
        // Window sill & frame
        cg.fillStyle = '#8b847c'
        cg.fillRect(wx - 2, wy - 2, 40, 40)
        // Glass: warm amber interior or soft sky reflection
        const grad = cg.createLinearGradient(wx, wy, wx, wy + 36)
        if (lit) {
          grad.addColorStop(0, '#ffe8a3')
          grad.addColorStop(1, '#f4b860')
        } else {
          grad.addColorStop(0, '#7ea8cc')
          grad.addColorStop(1, '#4c6d8a')
        }
        cg.fillStyle = grad
        cg.fillRect(wx, wy, 36, 36)
        // Diagonal anime glass sheen
        cg.fillStyle = 'rgba(255,255,255,0.28)'
        cg.beginPath()
        cg.moveTo(wx + 4, wy)
        cg.lineTo(wx + 16, wy)
        cg.lineTo(wx, wy + 22)
        cg.lineTo(wx, wy + 10)
        cg.closePath()
        cg.fill()
        // Window mullion
        cg.fillStyle = 'rgba(70,68,66,0.45)'
        cg.fillRect(wx + 17, wy, 2, 36)
        cg.fillRect(wx, wy + 17, 36, 2)
        bg.fillStyle = '#383838'
        bg.fillRect(wx, wy, 36, 36)
      }
    }
  } else if (style === 'metal') {
    // Painted industrial steel plates with rivets and diagonal grip
    cg.fillStyle = '#dce2e8'
    cg.fillRect(0, 0, 256, 256)
    for (let y = 0; y < 256; y += 64) {
      for (let x = 0; x < 256; x += 64) {
        const v = Math.round(212 + (rng() - 0.5) * 20)
        cg.fillStyle = `rgb(${v},${v + 4},${v + 8})`
        cg.fillRect(x + 2, y + 2, 60, 60)
        cg.strokeStyle = 'rgba(48,58,70,0.35)'
        cg.lineWidth = 2
        cg.strokeRect(x + 2, y + 2, 60, 60)
        bg.fillStyle = '#9a9a9a'
        bg.fillRect(x + 2, y + 2, 60, 60)
        // Rivets
        for (const [rx, ry] of [[8, 8], [56, 8], [8, 56], [56, 56]]) {
          cg.fillStyle = 'rgba(52,64,78,0.45)'
          cg.beginPath(); cg.arc(x + rx, y + ry, 2.5, 0, Math.PI * 2); cg.fill()
          bg.fillStyle = '#d8d8d8'
          bg.beginPath(); bg.arc(x + rx, y + ry, 2.5, 0, Math.PI * 2); bg.fill()
        }
      }
    }
  } else if (style === 'moss') {
    // Ghibli painterly sunlit grass & mossy stone
    cg.fillStyle = '#cfd9c6'
    cg.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 420; i++) {
      const x = rng() * 256
      const y = rng() * 256
      const r = 4 + rng() * 14
      const gCol = Math.round(185 + rng() * 45)
      const rCol = Math.round(gCol - 28 + rng() * 18)
      const bCol = Math.round(gCol - 44 + rng() * 16)
      cg.fillStyle = `rgba(${rCol},${gCol},${bCol},0.35)`
      cg.beginPath()
      cg.ellipse(x, y, r, r * 0.55, rng() * Math.PI, 0, Math.PI * 2)
      cg.fill()
      const bv = Math.round(115 + rng() * 55)
      bg.fillStyle = `rgba(${bv},${bv},${bv},0.35)`
      bg.beginPath(); bg.arc(x, y, r * 0.6, 0, Math.PI * 2); bg.fill()
    }
    // Tiny warm sunlit wildflowers
    for (let i = 0; i < 24; i++) {
      cg.fillStyle = rng() > 0.4 ? 'rgba(255,244,186,0.75)' : 'rgba(255,220,210,0.7)'
      cg.beginPath()
      cg.arc(rng() * 256, rng() * 256, 2.2, 0, Math.PI * 2)
      cg.fill()
    }
  } else if (style === 'marble') {
    // Celestial white-gold veined sanctuary marble
    cg.fillStyle = '#f5f4f0'
    cg.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 14; i++) {
      cg.strokeStyle = i % 3 === 0 ? 'rgba(222,190,118,0.42)' : 'rgba(175,186,202,0.32)'
      cg.lineWidth = 1 + rng() * 2.5
      cg.beginPath()
      let x = rng() * 256
      let y = 0
      cg.moveTo(x, y)
      for (let s = 1; s <= 8; s++) {
        x += (rng() - 0.5) * 44
        y = s * 32
        cg.lineTo(x, y)
      }
      cg.stroke()
    }
    // Large temple tile seams
    cg.strokeStyle = 'rgba(180,168,142,0.35)'
    cg.lineWidth = 2
    cg.strokeRect(2, 2, 124, 124)
    cg.strokeRect(130, 2, 124, 124)
    cg.strokeRect(2, 130, 124, 124)
    cg.strokeRect(130, 130, 124, 124)
    bg.strokeStyle = '#505050'
    bg.lineWidth = 2
    bg.strokeRect(2, 2, 124, 124)
    bg.strokeRect(130, 130, 124, 124)
  } else if (style === 'concrete') {
    // Sunlit courtyard plaza stone
    cg.fillStyle = '#d4d8dc'
    cg.fillRect(0, 0, 256, 256)
    for (let y = 0; y < 256; y += 32) {
      for (let x = 0; x < 256; x += 32) {
        const v = Math.round(205 + (rng() - 0.5) * 18)
        cg.fillStyle = `rgb(${v},${v + 2},${v + 4})`
        cg.fillRect(x + 1, y + 1, 30, 30)
      }
    }
    for (let i = 0; i < 200; i++) {
      const bv = Math.round(110 + rng() * 45)
      bg.fillStyle = `rgba(${bv},${bv},${bv},0.3)`
      bg.fillRect(rng() * 256, rng() * 256, 4, 4)
    }
  } else if (style === 'hazard') {
    // Crisp painted warning stripes
    cg.fillStyle = '#e8e8e8'
    cg.fillRect(0, 0, 256, 256)
    cg.fillStyle = 'rgba(0,0,0,0.12)'
    for (let i = -256; i < 512; i += 32) {
      cg.beginPath()
      cg.moveTo(i, 0); cg.lineTo(i + 16, 0); cg.lineTo(i - 64, 256); cg.lineTo(i - 80, 256)
      cg.closePath(); cg.fill()
    }
  } else {
    // Subtle brushed trim grain
    for (let i = 0; i < 120; i++) {
      const v = Math.round(210 + rng() * 35)
      cg.fillStyle = `rgba(${v},${v},${v},0.3)`
      cg.fillRect(0, rng() * 256, 256, 2)
    }
  }

  const repeat = style === 'concrete' ? 24 : style === 'facade' ? 3 : 1
  const pair: TexturePair = {
    map: finalize(cc, repeat, repeat, true),
    bumpMap: finalize(bc, repeat, repeat, false),
  }
  cache.set(style, pair)
  return pair
}
