import { mkdirSync, readFileSync, appendFileSync, writeFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const RUNS_ROOT = join(homedir(), '.claude', 'council-mode-evals')

export function openRun(runId, root = RUNS_ROOT) {
  const dir = join(root, runId)
  mkdirSync(dir, { recursive: true })
  const rowsPath = join(dir, 'rows.jsonl')
  const all = existsSync(rowsPath) ? readFileSync(rowsPath, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : []
  return {
    dir,
    append(row) { all.push(row); appendFileSync(rowsPath, JSON.stringify(row) + '\n') },
    // Every call costs money, failed or not, so spend sums all rows.
    spent() { return Math.round(all.reduce((s, r) => s + (r.cost || 0), 0) * 10000) / 10000 },
    latest() { const m = new Map(); for (const r of all) m.set(r.key, r); return [...m.values()] },
    writeRunInfo(info) { writeFileSync(join(dir, 'run.json'), JSON.stringify(info, null, 2)) },
    readRunInfo() { const p = join(dir, 'run.json'); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null },
  }
}
