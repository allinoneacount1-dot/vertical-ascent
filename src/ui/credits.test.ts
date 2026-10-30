// TEST-23b static half (DIRECTIVE §7; D-016 f; ref/05 §Kolom ASSET_MANIFEST.md, §Lisensi di build): every shipped
// CC-BY manifest row (integration_status INTEGRATED, path under public/) has an entry with attribution in
// src/ui/credits.json, and credits.json is exactly what scripts/build-credits.mjs writes from ASSET_MANIFEST.md.
// The CC-BY row selection below parses the manifest independently of scripts/lib/credits.mjs; the freshness check
// calls the shared pure helper. The Credits screen rendering it is the smoke half (G5).
import { describe, expect, it } from 'vitest'
import manifestText from '../../ASSET_MANIFEST.md?raw'
import creditsText from './credits.json?raw'

type CreditEntry = {
  id: string
  title: string
  author: string
  license: string
  attribution: string | null
  source: string | null
  modified: boolean
}
type CreditsLib = {
  parseManifest(markdown: string): Array<Record<string, string>>
  buildCredits(markdown: string): CreditEntry[]
  creditProblems(markdown: string): string[]
  renderCredits(entries: CreditEntry[]): string
}

// Non-literal specifier: the helper is plain ESM for Node (scripts/build-credits.mjs) without a declaration file,
// so it is typed through CreditsLib instead of being resolved by tsc.
const LIB_PATH = '../../scripts/lib/credits.mjs'
const lib = (await import(/* @vite-ignore */ LIB_PATH)) as CreditsLib
const credits = JSON.parse(creditsText) as CreditEntry[]

/** Independent reading of the manifest table: rows keyed by header name. */
function manifestRows(markdown: string): Array<Record<string, string>> {
  const lines = markdown.split(/\r?\n/)
  const start = lines.findIndex((l) => l.startsWith('| id | path |'))
  const cells = (l: string) => l.split('|').slice(1, -1).map((c) => c.trim())
  const header = cells(lines[start])
  const rows: Array<Record<string, string>> = []
  for (let i = start + 2; i < lines.length && lines[i].startsWith('|'); i++) {
    const c = cells(lines[i])
    rows.push(Object.fromEntries(header.map((h, k) => [h, c[k]])))
  }
  return rows
}

const shipped = (r: Record<string, string>) => r.integration_status.startsWith('INTEGRATED') && r.path.startsWith('public/')

const SYNTHETIC_HEADER = [
  '| id | path | title | author | source_url | license_id | attribution_text | modifications_made | integration_status |',
  '|---|---|---|---|---|---|---|---|---|',
]
const syntheticManifest = (...rows: string[]) => ['# ASSET_MANIFEST', '', ...SYNTHETIC_HEADER, ...rows, '', 'after the table'].join('\n')

describe('TEST-23b credits from the manifest (static half)', () => {
  const rows = manifestRows(manifestText)

  it('reads the manifest table', () => {
    expect(rows.length).toBeGreaterThan(5)
    expect(rows.every((r) => typeof r.integration_status === 'string' && typeof r.path === 'string')).toBe(true)
  })

  it('every INTEGRATED public/ CC-BY row has a credits entry with its license and attribution', () => {
    const byId = new Map(credits.map((e) => [e.id, e]))
    for (const r of rows.filter((x) => shipped(x) && x.license_id.startsWith('CC-BY'))) {
      const e = byId.get(r.id)
      expect(e, r.id).toBeDefined()
      expect(e?.license, r.id).toBe(r.license_id)
      expect(e?.attribution, r.id).toBeTruthy()
    }
  })

  it('has one entry per shipped row and nothing else', () => {
    expect(credits.map((e) => e.id)).toEqual(rows.filter(shipped).map((r) => r.id))
  })

  it('credits.json is what scripts/build-credits.mjs writes (node scripts/build-credits.mjs --check)', () => {
    expect(lib.creditProblems(manifestText)).toEqual([])
    expect(creditsText.replace(/\r\n/g, '\n')).toBe(lib.renderCredits(lib.buildCredits(manifestText)))
  })

  it('product-facing strings pass the D-016 gates (no remote asset URL, no forbidden names)', () => {
    expect(creditsText).not.toMatch(/https?:\/\/[^"']+\.(vrm|glb|gltf|fbx|vrma|bvh|mp3|ogg|wav|png|jpg|hdr|ktx2)/)
    expect(creditsText).not.toMatch(/\bonly[ _-]?up\b|fortnite|viverse-logo/i)
  })

  it('selects and shapes rows as specified (the helper is not vacuous)', () => {
    const md = syntheticManifest(
      '| by | public/assets/a.glb | Rock | Ann | https://example.org/rock | CC-BY-4.0 | "Rock by Ann (example.org), CC BY 4.0" | recoloured | INTEGRATED |',
      '| zero | public/assets/b.glb | Tree | Bob | — | CC0-1.0 | "Tree by Bob" (optional) | none | INTEGRATED (blockout) |',
      '| planned | public/assets/c.glb | Bush | Cy | — | CC-BY-4.0 | "Bush by Cy" | none | DOWNLOADED |',
      '| bundled | (bundled in node_modules/x) | Box | Di | — | CC0-1.0 | — | none | INTEGRATED |',
    )
    expect(lib.buildCredits(md)).toEqual([
      { id: 'by', title: 'Rock', author: 'Ann', license: 'CC-BY-4.0', attribution: 'Rock by Ann (example.org), CC BY 4.0', source: 'https://example.org/rock', modified: true },
      { id: 'zero', title: 'Tree', author: 'Bob', license: 'CC0-1.0', attribution: 'Tree by Bob', source: null, modified: false },
    ])
    expect(lib.creditProblems(md)).toEqual([])
  })

  it('reports a shipped CC-BY row without attribution and a malformed row', () => {
    const missing = syntheticManifest('| by | public/assets/a.glb | Rock | Ann | — | CC-BY-4.0 | — | none | INTEGRATED |')
    expect(lib.creditProblems(missing)).toEqual(['by: CC-BY-4.0 ships without attribution_text'])
    const short = syntheticManifest('| by | public/assets/a.glb | Rock |')
    expect(() => lib.buildCredits(short)).toThrow(/3 cells, header has 9/)
  })
})
