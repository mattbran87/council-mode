#!/usr/bin/env node
// Layer 2: node evals/probe.mjs --run-id <id> [--budget-usd 5] [--repeats 3]
import { spawnSync } from 'node:child_process'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadCases, validateCase, buildPrompt, STAGES, checkShape, outcome, passed, score, planFor, startConfidence, newConfidence } from './lib/probe-core.mjs'
import { runClaude, claudeArgv, PER_CALL_CAP_USD } from './lib/claude.mjs'
import { openRun, RUNS_ROOT } from './lib/runstore.mjs'

const MIN_CALL_USD = 0.01
const MAX_FAILURE_STREAK = 3

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCRIPT_REL = 'plugins/council-mode/skills/council/council.workflow.js'

// Uncommitted edits to the script keep the same sha, so a dirty file adds a content hash;
// otherwise a rerun would reuse rows scored against the old prompts.
export function commitLabel(sha, dirty, content) {
  if (!dirty) return sha
  return `${sha}+${createHash('sha256').update(content).digest('hex').slice(0, 8)}`
}

export function scriptCommit() {
  const git = args => spawnSync('git', args, { encoding: 'utf8', cwd: REPO_ROOT })
  const sha = (git(['log', '-1', '--format=%h', '--', SCRIPT_REL]).stdout || '').trim() || 'unknown'
  const dirty = (git(['status', '--porcelain', '--', SCRIPT_REL]).stdout || '').trim() !== ''
  let content = ''
  if (dirty) { try { content = readFileSync(join(REPO_ROOT, SCRIPT_REL)) } catch { /* label from sha alone */ } }
  return commitLabel(sha, dirty, content)
}

export function runProbe({ runId, budgetUsd = 5, repeats = 3, root = RUNS_ROOT, runner, argv0 = claudeArgv(), scriptCommit: commit = scriptCommit(), cases = loadCases() }) {
  const problems = cases.flatMap(c => validateCase(c).map(p => `${c.id}: ${p}`))
  if (problems.length) throw new Error(`invalid probe cases:\n${problems.join('\n')}`)
  const run = openRun(runId, root)
  const info = run.readRunInfo() || { runId, scriptCommit: commit, budgetUsd, repeats, started: new Date().toISOString() }
  run.writeRunInfo({ ...info, budgetUsd })
  const result = extra => ({ rows: run.latest(), score: score(run.latest().filter(r => r.scriptCommit === commit), planFor(cases, repeats)), run: { ...info, budgetUsd, spent: run.spent() }, ...extra })
  if (!argv0) return result({ stoppedBy: 'no-claude', lastError: 'claude is not on the PATH' })

  const done = new Set(run.latest().filter(r => r.status !== 'failed').map(r => r.key))
  let streak = 0
  let lastError = null
  for (const c of cases) {
    for (let attempt = 1; attempt <= repeats; attempt++) {
      const key = `${c.id}#${attempt}@${commit}`
      if (done.has(key)) continue
      const remaining = budgetUsd - run.spent()
      if (remaining < MIN_CALL_USD) return result({ stoppedBy: 'budget' })
      const stage = STAGES[c.stage]
      const res = runClaude({ prompt: buildPrompt(c), model: stage.model, schema: stage.schema, budgetUsd: Math.min(PER_CALL_CAP_USD, remaining), runner, argv0 })
      const row = {
        key, scriptCommit: commit, caseId: c.id, attempt, stage: c.stage, kind: c.kind, model: stage.model,
        cost: res.cost ?? PER_CALL_CAP_USD, costEstimated: res.cost == null, durationMs: res.durationMs ?? null,
      }
      if (!res.ok) {
        row.status = 'failed'; row.error = res.error; if (res.subtype) row.subtype = res.subtype; streak++; lastError = res.error
      } else if (!checkShape(c.stage, res.output)) {
        row.status = 'invalid'; row.output = res.output; streak = 0
      } else {
        const oc = outcome(c, res.output)
        row.status = 'scored'; row.outcome = oc; row.pass = passed(c, oc); row.output = res.output; streak = 0
        if (c.stage === 'reply') { row.startConfidence = startConfidence(c); row.newConfidence = newConfidence(res.output) }
      }
      run.append(row)
      if (streak >= MAX_FAILURE_STREAK) return result({ stoppedBy: 'failures', lastError })
    }
  }
  return result({ stoppedBy: null })
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runId = arg('run-id')
  if (!runId) { console.error('usage: node evals/probe.mjs --run-id <id> [--budget-usd 5] [--repeats 3]'); process.exit(2) }
  const usage = 'usage: node evals/probe.mjs --run-id <id> [--budget-usd 5] [--repeats 3]'
  const budgetUsd = Number(arg('budget-usd', 5))
  const repeats = Number(arg('repeats', 3))
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0 || !Number.isInteger(repeats) || repeats < 1) { console.error(usage); process.exit(2) }
  const res = runProbe({ runId, budgetUsd, repeats })
  const { formatReport } = await import('./report.mjs')
  console.log(formatReport(res.rows, res.run))
  if (res.stoppedBy === 'no-claude') { console.error('claude is not on the PATH. Install Claude Code or fix PATH, then rerun.'); process.exit(1) }
  if (res.stoppedBy === 'failures') { console.error(`Stopped after ${MAX_FAILURE_STREAK} failed calls in a row. Last error: ${res.lastError}. Rerun to resume.`); process.exit(1) }
  if (res.stoppedBy === 'budget') console.error('Stopped at the budget cap; the run is partial. Raise --budget-usd and rerun to continue.')
}
