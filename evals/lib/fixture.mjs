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

// Throws when meta.json or result.json is missing or invalid; the caller reports that fixture as ERROR.
export function loadFixture(dir) {
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'))
  const top = JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8'))
  if (!top || typeof top.result !== 'object') throw new Error('result.json has no workflow result')
  const journalPath = join(dir, 'journal.jsonl')
  const journal = existsSync(journalPath)
    ? readFileSync(journalPath, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
    : []
  return { dir, meta, top, run: top.result, journal }
}
