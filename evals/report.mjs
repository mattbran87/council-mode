#!/usr/bin/env node
// node evals/report.mjs --run-id <id>: prints the report and writes report.md into the run folder.
import { writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { score, planFor, newConfidence } from './lib/probe-core.mjs'
import { openRun, RUNS_ROOT } from './lib/runstore.mjs'

// A reply partial shows the confidence change: "partial 85→78", or "partial →78" on rows saved before startConfidence.
function outcomeLabel(r) {
  if (r.stage !== 'reply' || r.outcome !== 'partial') return r.outcome
  const now = r.newConfidence ?? newConfidence(r.output)
  if (now == null) return r.outcome
  return `partial ${r.startConfidence ?? ''}→${now}`
}

// Runs from before run.json held a plan: count the cases that appear in the rows.
function planOf(rows, run) {
  if (run.plan) return run.plan
  const seen = new Map(rows.map(r => [r.caseId, { stage: r.stage, kind: r.kind }]))
  return planFor([...seen.values()], Number.isInteger(run.repeats) && run.repeats > 0 ? run.repeats : 3)
}

function formatGroup(rows, run) {
  const s = score(rows, planOf(rows, run))
  const share = x => `${x.passed}/${x.valid}`
  const lines = [
    `# Probe run ${run.runId}`,
    '',
    `Script commit ${run.scriptCommit}. Spend $${(run.spent ?? 0).toFixed(2)} of $${Number(run.budgetUsd).toFixed(2)}.`,
    '',
    '| Stage | Trap resistance | Control acceptance | Invalid | Result | Confidence |',
    '| --- | --- | --- | --- | --- | --- |',
    ...Object.entries(s).map(([stage, x]) => `| ${stage} | ${share(x.trap)} | ${share(x.control)} | ${x.invalid} | ${x.result} | ${x.confidence} |`),
    '',
    '| Case | Stage | Kind | Outcomes |',
    '| --- | --- | --- | --- |',
  ]
  const byCase = new Map()
  for (const r of rows) {
    if (!byCase.has(r.caseId)) byCase.set(r.caseId, { stage: r.stage, kind: r.kind, outs: [] })
    byCase.get(r.caseId).outs.push(r.status === 'scored' ? `${outcomeLabel(r)}${r.pass ? '' : ' ✗'}` : r.status)
  }
  for (const [id, x] of byCase) lines.push(`| ${id} | ${x.stage} | ${x.kind} | ${x.outs.join(', ')} |`)
  const timed = rows.filter(r => typeof r.durationMs === 'number')
  if (timed.length) {
    const slow = timed.reduce((a, b) => (b.durationMs > a.durationMs ? b : a))
    lines.push('', `Slowest call: ${slow.caseId} ${Math.round(slow.durationMs / 1000)} s.`)
  }
  const failed = rows.filter(r => r.status === 'failed')
  if (failed.length) lines.push('', 'Failed calls:', ...failed.map(r => `- ${r.key}${r.subtype ? ` (${r.subtype})` : ''}: ${r.error}`))
  return lines.join('\n')
}

// Runs from different script commits are never mixed: one section per commit.
export function formatReport(rows, run) {
  const commits = [...new Set(rows.map(r => r.scriptCommit).filter(Boolean))]
  if (commits.length <= 1) return formatGroup(rows, { ...run, scriptCommit: commits[0] ?? run.scriptCommit })
  return commits.map(c => formatGroup(rows.filter(r => r.scriptCommit === c), { ...run, scriptCommit: c })).join('\n\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--run-id')
  const runId = i > 0 ? process.argv[i + 1] : null
  if (!runId) { console.error('usage: node evals/report.mjs --run-id <id>'); process.exit(2) }
  // Check first: openRun creates the folder, and a mistyped id must not leave an empty run behind.
  if (!existsSync(join(RUNS_ROOT, runId, 'run.json'))) { console.error(`no run named ${runId}`); process.exit(1) }
  const run = openRun(runId)
  const info = run.readRunInfo()
  const md = formatReport(run.latest(), { ...info, spent: run.spent() })
  writeFileSync(join(run.dir, 'report.md'), md)
  console.log(md)
}
