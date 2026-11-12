#!/usr/bin/env node
// Persona test: node evals/persona.mjs --run-id <id> [--budget-usd 10] [--repeats 3]
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { H } from './lib/helpers.mjs'
import { loadFixture } from './lib/fixture.mjs'
import { runClaude, claudeArgv, PER_CALL_CAP_USD } from './lib/claude.mjs'
import { openRun, RUNS_ROOT } from './lib/runstore.mjs'
import { scriptCommit } from './probe.mjs'
import {
  loadVoters, VERSIONS, JUDGE_MODEL, JUDGE_SCHEMA, votePromptFor, orderFor, judgePrompt,
  evaluate, summarize, formatPersonaReport,
} from './lib/persona-core.mjs'

export const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/2026-11-11-cli-language', import.meta.url))
const MIN_CALL_USD = 0.01
const MAX_FAILURE_STREAK = 3

export function runPersonaTest({
  runId, budgetUsd = 10, repeats = 3, root = RUNS_ROOT, runner, argv0 = claudeArgv(),
  scriptCommit: commit = scriptCommit(), voters = loadVoters(), fixtureDir = FIXTURE_DIR,
}) {
  const fx = loadFixture(fixtureDir)
  const { dossier, options } = fx.run
  const labels = options.map(o => o.label)
  const ids = H.dossierIds(dossier)
  // The label changes when the vote prompt or the voters file changes, so either edit reruns the calls.
  const label = `${commit}/${voters.hash}`
  const run = openRun(runId, root)
  const info = run.readRunInfo() || { runId, kind: 'persona', started: new Date().toISOString() }
  run.writeRunInfo({ ...info, scriptCommit: label, budgetUsd, repeats })
  const done = new Set(run.latest().filter(r => r.status === 'ok').map(r => r.key))
  let streak = 0
  let lastError = null
  let stoppedBy = argv0 ? null : 'no-claude'

  const call = (key, meta, prompt, model, schema) => {
    if (stoppedBy || done.has(key)) return
    const remaining = budgetUsd - run.spent()
    if (remaining < MIN_CALL_USD) { stoppedBy = 'budget'; return }
    const res = runClaude({ prompt, model, schema, tools: [], budgetUsd: Math.min(PER_CALL_CAP_USD, remaining), runner, argv0 })
    const row = { key, scriptCommit: label, ...meta, model, cost: res.cost ?? PER_CALL_CAP_USD, costEstimated: res.cost == null, durationMs: res.durationMs ?? null }
    if (!res.ok || res.output == null) {
      row.status = 'failed'
      row.error = res.error || 'no structured output'
      if (res.subtype) row.subtype = res.subtype
      streak++
      lastError = row.error
    } else {
      row.status = 'ok'
      row.output = res.output
      streak = 0
      done.add(key)
    }
    run.append(row)
    if (streak >= MAX_FAILURE_STREAK) stoppedBy = 'failures'
  }

  const cells = voters.voters.flatMap((voter, i) => VERSIONS.flatMap(version =>
    Array.from({ length: repeats }, (_, k) => ({ voter, i, version, attempt: k + 1, cell: `${i}:${version}#${k + 1}` }))))
  const meta = c => ({ cell: c.cell, voter: c.voter.name, version: c.version, attempt: c.attempt })

  // Voter calls first.
  for (const c of cells) {
    const order = orderFor(voters.seed, c.i, labels)
    const prompt = votePromptFor(c.version, c.voter, H.renderDossier(dossier, order), order)
    call(`vote:${c.cell}@${label}`, { step: 'vote', ...meta(c) }, prompt, c.voter.model, H.BALLOT_SCHEMA)
  }
  // Then one judge call per valid ballot.
  const current = () => run.latest().filter(r => r.scriptCommit === label)
  for (const c of cells) {
    const vote = current().find(r => r.step === 'vote' && r.cell === c.cell && r.status === 'ok')
    if (!vote) continue
    const ballot = H.normalizeBallot(vote.output, labels, ids)
    if (!H.validateBallot(ballot, labels, ids).valid) continue
    call(`judge:${c.cell}@${label}`, { step: 'judge', ...meta(c) }, judgePrompt(c.voter, ballot, options), JUDGE_MODEL, JUDGE_SCHEMA)
  }

  const rows = current()
  const results = evaluate(rows, voters.voters, VERSIONS, repeats, labels, ids)
  const summary = summarize(results, voters.voters)
  const runInfo = { ...info, runId, scriptCommit: label, budgetUsd, repeats, spent: run.spent() }
  return { rows, results, summary, stoppedBy, lastError, run: runInfo, dir: run.dir }
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const usage = 'usage: node evals/persona.mjs --run-id <id> [--budget-usd 10] [--repeats 3]'
  const runId = arg('run-id')
  const budgetUsd = Number(arg('budget-usd', 10))
  const repeats = Number(arg('repeats', 3))
  if (!runId || !Number.isFinite(budgetUsd) || budgetUsd <= 0 || !Number.isInteger(repeats) || repeats < 1) { console.error(usage); process.exit(2) }
  const res = runPersonaTest({ runId, budgetUsd, repeats })
  const md = formatPersonaReport(res.summary, res.run, res.rows.filter(r => r.status === 'failed'))
  writeFileSync(join(res.dir, 'report.md'), md)
  console.log(md)
  if (res.stoppedBy === 'no-claude') { console.error('claude is not on the PATH. Install Claude Code or fix PATH, then rerun.'); process.exit(1) }
  if (res.stoppedBy === 'failures') { console.error(`Stopped after ${MAX_FAILURE_STREAK} failed calls in a row. Last error: ${res.lastError}. Rerun to resume.`); process.exit(1) }
  if (res.stoppedBy === 'budget') console.error('Stopped at the budget cap; the run is partial. Raise --budget-usd and rerun to continue.')
}
