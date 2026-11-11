import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const FIXTURES_ROOT = fileURLToPath(new URL('../fixtures/', import.meta.url))

export function listFixtures(root = FIXTURES_ROOT) {
  return readdirSync(root, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => join(root, d.name))
    .sort()
}

// Parse JSON text and name the file (and line, when given) in any error.
function parseIn(file, text, lineNo) {
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new Error(`${file}${lineNo ? `:${lineNo}` : ''}: ${e.message}`)
  }
}

function readIn(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch (e) {
    throw new Error(`${file}: ${e.message}`)
  }
}

// Throws when meta.json or result.json is missing or invalid; the caller reports that fixture as ERROR.
export function loadFixture(dir) {
  const metaPath = join(dir, 'meta.json')
  const resultPath = join(dir, 'result.json')
  const journalPath = join(dir, 'journal.jsonl')
  const meta = parseIn(metaPath, readIn(metaPath))
  const top = parseIn(resultPath, readIn(resultPath))
  if (!top || typeof top.result !== 'object' || top.result === null || Array.isArray(top.result)) {
    throw new Error(`${resultPath}: result.json has no workflow result`)
  }
  const journal = existsSync(journalPath)
    ? readIn(journalPath).split(/\r?\n/)
        .map((l, i) => [l, i + 1])
        .filter(([l]) => l.trim())
        .map(([l, n]) => parseIn(journalPath, l, n))
    : []
  return { dir, meta, top, run: top.result, journal }
}
