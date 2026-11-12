// The shared voter-test runner: voter calls, then one judge call per valid ballot, with a budget, resume, and a failure stop.
import { basename } from 'node:path'
import { H } from './helpers.mjs'
import { loadFixture } from './fixture.mjs'
import { runClaude, PER_CALL_CAP_USD } from './claude.mjs'
import { openRun } from './runstore.mjs'
import { orderFor, evaluate } from './persona-core.mjs'

export const MIN_CALL_USD = 0.01
export const MAX_FAILURE_STREAK = 3

// test: { kind, versions, votePrompt(version, voter, index, dossierText, order), judge: { model, schema, prompt(voter, ballot, options) }, measure(judgment, ballot, version) }
export function runVoterTest({ runId, budgetUsd, repeats, root, runner, argv0, commit, voters, fixtureDir, test }) {
  const fx = loadFixture(fixtureDir)
  const { dossier, options } = fx.run
  const labels = options.map(o => o.label)
  const ids = H.dossierIds(dossier)
  // The label changes with the vote prompt, the voters file, or the fixture, so any of them reruns the calls.
  const label = `${commit}/${voters.hash}/${basename(fixtureDir)}`
  const run = openRun(runId, root)
  const info = run.readRunInfo() || { runId, kind: test.kind, started: new Date().toISOString() }
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

  const cells = voters.voters.flatMap((voter, i) => test.versions.flatMap(version =>
    Array.from({ length: repeats }, (_, k) => ({ voter, i, version, attempt: k + 1, cell: `${i}:${version}#${k + 1}` }))))
  const meta = c => ({ cell: c.cell, voter: c.voter.name, version: c.version, attempt: c.attempt })

  // Voter calls first.
  for (const c of cells) {
    const order = orderFor(voters.seed, c.i, labels)
    const prompt = test.votePrompt(c.version, c.voter, c.i, H.renderDossier(dossier, order), order)
    call(`vote:${c.cell}@${label}`, { step: 'vote', ...meta(c) }, prompt, c.voter.model, H.BALLOT_SCHEMA)
  }
  // Then one judge call per valid ballot.
  const current = () => run.latest().filter(r => r.scriptCommit === label)
  for (const c of cells) {
    const vote = current().find(r => r.step === 'vote' && r.cell === c.cell && r.status === 'ok')
    if (!vote) continue
    const ballot = H.normalizeBallot(vote.output, labels, ids)
    if (!H.validateBallot(ballot, labels, ids).valid) continue
    call(`judge:${c.cell}@${label}`, { step: 'judge', ...meta(c) }, test.judge.prompt(c.voter, ballot, options), test.judge.model, test.judge.schema)
  }

  const rows = current()
  const results = evaluate(rows, voters.voters, test.versions, repeats, labels, ids, test.measure)
  const runInfo = { ...info, runId, scriptCommit: label, budgetUsd, repeats, spent: run.spent() }
  return { rows, results, stoppedBy, lastError, run: runInfo, dir: run.dir }
}
