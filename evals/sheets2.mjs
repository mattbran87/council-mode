#!/usr/bin/env node
// Sheet v2 test: node evals/sheets2.mjs --run-id <id> [--budget-usd 15] [--repeats 3]
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { claudeArgv } from './lib/claude.mjs'
import { RUNS_ROOT } from './lib/runstore.mjs'
import { scriptCommit } from './probe.mjs'
import { loadVoters, JUDGE_MODEL, JUDGE_SCHEMA } from './lib/persona-core.mjs'
import { runVoterTest, MAX_FAILURE_STREAK } from './lib/voter-runner.mjs'
import { SHEETS_FIXTURE_DIR } from './sheets.mjs'
import { SHEET2_VERSIONS, SHEETS2_VOTERS_PATH, sheet2VotePrompt, voteSchema2, judge2Prompt, sheet2Measures, summarizeSheets2, formatSheet2Report } from './lib/sheet2-core.mjs'

export function runSheet2Test({
  runId, budgetUsd = 15, repeats = 3, root = RUNS_ROOT, runner, argv0 = claudeArgv(),
  scriptCommit: commit = scriptCommit(), voters = loadVoters(SHEETS2_VOTERS_PATH), fixtureDir = SHEETS_FIXTURE_DIR,
}) {
  const test = {
    kind: 'sheets2',
    versions: SHEET2_VERSIONS,
    votePrompt: (version, voter, i, dossierText, order) => sheet2VotePrompt(version, voter, dossierText, order),
    voteSchema: voteSchema2,
    // One reference for every version: the 3 items with definitions, Accepts, and Rejects.
    judge: { model: JUDGE_MODEL, schema: JUDGE_SCHEMA, prompt: judge2Prompt },
    measure: sheet2Measures,
  }
  const res = runVoterTest({ runId, budgetUsd, repeats, root, runner, argv0, commit, voters, fixtureDir, test })
  return { ...res, summary: summarizeSheets2(res.results, voters.voters) }
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const usage = 'usage: node evals/sheets2.mjs --run-id <id> [--budget-usd 15] [--repeats 3]'
  const runId = arg('run-id')
  const budgetUsd = Number(arg('budget-usd', 15))
  const repeats = Number(arg('repeats', 3))
  if (!runId || !Number.isFinite(budgetUsd) || budgetUsd <= 0 || !Number.isInteger(repeats) || repeats < 1) { console.error(usage); process.exit(2) }
  const res = runSheet2Test({ runId, budgetUsd, repeats })
  const md = formatSheet2Report(res.summary, res.run, res.rows.filter(r => r.status === 'failed'))
  writeFileSync(join(res.dir, 'report.md'), md)
  console.log(md)
  if (res.stoppedBy === 'no-claude') { console.error('claude is not on the PATH. Install Claude Code or fix PATH, then rerun.'); process.exit(1) }
  if (res.stoppedBy === 'failures') { console.error(`Stopped after ${MAX_FAILURE_STREAK} failed calls in a row. Last error: ${res.lastError}. Rerun to resume.`); process.exit(1) }
  if (res.stoppedBy === 'budget') console.error('Stopped at the budget cap; the run is partial. Raise --budget-usd and rerun to continue.')
}
