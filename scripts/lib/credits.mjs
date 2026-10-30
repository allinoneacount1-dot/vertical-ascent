// Credits data from ASSET_MANIFEST.md (DIRECTIVE §5 G3 step 5 "layar Credits dari manifest", D-016 f; ref/05
// §Kolom ASSET_MANIFEST.md, §Lisensi di build; TEST-23b in §7). Pure functions, no I/O: used by
// scripts/build-credits.mjs (writes src/ui/credits.json) and src/ui/credits.test.ts (freshness check).
// A row ships when its integration_status starts with INTEGRATED and its path is under public/.
// Entry fields: id, title, author, license (= license_id), attribution (= attribution_text without the surrounding
// quotes and without a trailing " (optional)"; null when the cell is empty), source (= source_url; null when empty),
// modified (modifications_made is not "none"/empty; ref/05 asks CREDITS.md for a "modified" flag per CC-BY asset).

/** Header row of the manifest table (ref/05 §Kolom: the first two columns). */
const HEADER_PREFIX = '| id | path |'
/** Cell values that mean "no value" in the manifest. */
const EMPTY = new Set(['', '—', '-', 'n/a'])
/** Columns every shipped row needs (the TASL fields of ref/05 §Lisensi di build plus the id). */
const REQUIRED = ['id', 'title', 'author', 'license_id']

/** Splits one markdown table line into trimmed cells; "\|" is an escaped pipe inside a cell. */
function splitRow(line) {
  const cells = line.trim().split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'))
  // A table line starts and ends with "|": drop the empty pieces outside the first and last pipe.
  return cells.slice(1, cells.length - 1)
}

/**
 * Parses the manifest table (the one whose header row starts with "| id | path |") into row objects keyed by the
 * header names. Throws when the table is missing or a row has a different cell count than the header.
 * @param {string} markdown
 * @returns {Array<Record<string, string>>}
 */
export function parseManifest(markdown) {
  const lines = markdown.split(/\r?\n/)
  const start = lines.findIndex((l) => l.startsWith(HEADER_PREFIX))
  if (start < 0) throw new Error(`ASSET_MANIFEST.md: no table header starting with "${HEADER_PREFIX}"`)
  const header = splitRow(lines[start])
  if (!/^\|\s*:?-+/.test(lines[start + 1] ?? '')) throw new Error('ASSET_MANIFEST.md: header row is not followed by a separator row')
  const rows = []
  for (let i = start + 2; i < lines.length && lines[i].trim().startsWith('|'); i++) {
    const cells = splitRow(lines[i])
    if (cells.length !== header.length) {
      throw new Error(`ASSET_MANIFEST.md line ${i + 1} (${cells[0] ?? '?'}): ${cells.length} cells, header has ${header.length}`)
    }
    rows.push(Object.fromEntries(header.map((name, k) => [name, cells[k]])))
  }
  return rows
}

/** "value" of a cell, or null when the cell means "no value". */
function valueOrNull(cell) {
  const v = (cell ?? '').trim()
  return EMPTY.has(v) ? null : v
}

/**
 * True when the row is an asset that ships: integration_status INTEGRATED (also "INTEGRATED (…)") and a path under
 * public/ (BUILD-ONLY files under public/assets/_build-only/ ship inside the game build, so they count).
 * @param {Record<string, string>} row
 */
export function isShipped(row) {
  const path = (row.path ?? '').trim().replace(/^`(.*)`$/, '$1')
  return /^INTEGRATED\b/.test((row.integration_status ?? '').trim()) && path.startsWith('public/')
}

/**
 * attribution_text without a trailing " (optional)" and without the surrounding quotes; null when empty.
 * @param {string | undefined} cell
 * @returns {string | null}
 */
export function attributionOf(cell) {
  let v = valueOrNull(cell)
  if (v === null) return null
  v = v.replace(/\s*\(optional\)$/i, '').trim()
  const quoted = /^"(.*)"$/.exec(v) ?? /^“(.*)”$/.exec(v)
  if (quoted) v = quoted[1].trim()
  return v === '' ? null : v
}

/**
 * One credits entry from a manifest row.
 * @param {Record<string, string>} row
 */
export function creditEntry(row) {
  const mods = valueOrNull(row.modifications_made)
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    license: row.license_id,
    attribution: attributionOf(row.attribution_text),
    source: valueOrNull(row.source_url),
    modified: mods !== null && mods.toLowerCase() !== 'none',
  }
}

/**
 * Credits entries for every shipped row, in manifest order.
 * @param {string} markdown ASSET_MANIFEST.md text
 */
export function buildCredits(markdown) {
  return parseManifest(markdown).filter(isShipped).map(creditEntry)
}

/**
 * Problems that block the credits (license blockers are never worked around, DIRECTIVE §8 item 4): a shipped row
 * without id/title/author/license_id, a duplicate id, or a shipped CC-BY row without attribution_text.
 * @param {string} markdown ASSET_MANIFEST.md text
 * @returns {string[]}
 */
export function creditProblems(markdown) {
  const problems = []
  const seen = new Set()
  for (const row of parseManifest(markdown).filter(isShipped)) {
    for (const col of REQUIRED) if (valueOrNull(row[col]) === null) problems.push(`${row.id || '(no id)'}: empty ${col}`)
    if (seen.has(row.id)) problems.push(`${row.id}: duplicate id`)
    seen.add(row.id)
    if (/^CC-BY/i.test(row.license_id ?? '') && attributionOf(row.attribution_text) === null) {
      problems.push(`${row.id}: ${row.license_id} ships without attribution_text`)
    }
  }
  return problems
}

/**
 * The exact text of src/ui/credits.json (2-space JSON, LF, trailing newline).
 * @param {ReturnType<typeof buildCredits>} entries
 */
export function renderCredits(entries) {
  return `${JSON.stringify(entries, null, 2)}\n`
}
