#!/usr/bin/env node
// node evals/report.mjs --run-id <id>: prints the report and writes report.md into the run folder.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { score } from './lib/probe-core.mjs'
import { openRun } from './lib/runstore.mjs'

function formatGroup(rows, run) {
  const s = score(rows)
  const share = x => `${x.passed}/${x.valid}`
  const lines = [
    `# Probe run ${run.runId}`,
    '',
    `Script commit ${run.scriptCommit}. Spend $${(run.spent ?? 0).toFixed(2)} of $${Number(run.budgetUsd).toFixed(2)}.`,
    '',
    '| Stage | Trap resistance | Control acceptance | Invalid | Result |',
    '| --- | --- | --- | --- | --- |',
    ...Object.entries(s).map(([stage, x]) => `| ${stage} | ${share(x.trap)} | ${share(x.control)} | ${x.invalid} | ${x.pass ? 'PASS' : 'FAIL'} |`),
    '',
    '| Case | Stage | Kind | Outcomes |',
    '| --- | --- | --- | --- |',
  ]
  const byCase = new Map()
  for (const r of rows) {
    if (!byCase.has(r.caseId)) byCase.set(r.caseId, { stage: r.stage, kind: r.kind, outs: [] })
    byCase.get(r.caseId).outs.push(r.status === 'scored' ? `${r.outcome}${r.pass ? '' : ' ✗'}` : r.status)
  }
  for (const [id, x] of byCase) lines.push(`| ${id} | ${x.stage} | ${x.kind} | ${x.outs.join(', ')} |`)
  const timed = rows.filter(r => typeof r.durationMs === 'number')
  if (timed.length) {
    const slow = timed.reduce((a, b) => (b.durationMs > a.durationMs ? b : a))
    lines.push('', `Slowest call: ${slow.caseId} ${Math.round(slow.durationMs / 1000)} s.`)
  }
  const failed = rows.filter(r => r.status === 'failed')
  if (failed.length) lines.push('', 'Failed calls:', ...failed.map(r => `- ${r.key}: ${r.error}`))
  return lines.join('\n')
}

// Runs from different script commits are never mixed: one section per commit.
export function formatReport(rows, run) {
  const commits = [...new Set(rows.map(r => r.scriptCommit).filter(Boolean))]
  if (commits.length <= 1) return formatGroup(rows, run)
  return commits.map(c => formatGroup(rows.filter(r => r.scriptCommit === c), { ...run, scriptCommit: c })).join('\n\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--run-id')
  const runId = i > 0 ? process.argv[i + 1] : null
  if (!runId) { console.error('usage: node evals/report.mjs --run-id <id>'); process.exit(2) }
  const run = openRun(runId)
  const info = run.readRunInfo()
  if (!info) { console.error(`no run named ${runId}`); process.exit(1) }
  const md = formatReport(run.latest(), { ...info, spent: run.spent() })
  writeFileSync(join(run.dir, 'report.md'), md)
  console.log(md)
}
