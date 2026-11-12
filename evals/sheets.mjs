#!/usr/bin/env node
// Sheet-quality test: node evals/sheets.mjs --run-id <id> [--budget-usd 15] [--repeats 3]
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { H } from './lib/helpers.mjs'
import { claudeArgv } from './lib/claude.mjs'
import { RUNS_ROOT } from './lib/runstore.mjs'
import { scriptCommit } from './probe.mjs'
import { loadVoters, JUDGE_MODEL, JUDGE_SCHEMA, judgePrompt } from './lib/persona-core.mjs'
import { runVoterTest, MAX_FAILURE_STREAK } from './lib/voter-runner.mjs'
import { SHEET_VERSIONS, SHEETS_VOTERS_PATH, sheetIdentity, referenceCriteria, sheetMeasures, summarizeSheets, formatSheetReport } from './lib/sheet-core.mjs'

export const SHEETS_FIXTURE_DIR = fileURLToPath(new URL('./fixtures/2026-11-12-cli-5lang', import.meta.url))

export function runSheetTest({
  runId, budgetUsd = 15, repeats = 3, root = RUNS_ROOT, runner, argv0 = claudeArgv(),
  scriptCommit: commit = scriptCommit(), voters = loadVoters(SHEETS_VOTERS_PATH), fixtureDir = SHEETS_FIXTURE_DIR,
}) {
  const test = {
    kind: 'sheets',
    versions: SHEET_VERSIONS,
    votePrompt: (version, voter, i, dossierText, order) => H.votePrompt(voter, dossierText, order, sheetIdentity(version, voter, voters.seed, i)),
    // The judge always scores against the full reference sheet, never the variant the voter saw.
    judge: { model: JUDGE_MODEL, schema: JUDGE_SCHEMA, prompt: (voter, ballot, options) => judgePrompt({ criteria: referenceCriteria(voter) }, ballot, options) },
    measure: sheetMeasures,
  }
  const res = runVoterTest({ runId, budgetUsd, repeats, root, runner, argv0, commit, voters, fixtureDir, test })
  return { ...res, summary: summarizeSheets(res.results, voters.voters) }
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const usage = 'usage: node evals/sheets.mjs --run-id <id> [--budget-usd 15] [--repeats 3]'
  const runId = arg('run-id')
  const budgetUsd = Number(arg('budget-usd', 15))
  const repeats = Number(arg('repeats', 3))
  if (!runId || !Number.isFinite(budgetUsd) || budgetUsd <= 0 || !Number.isInteger(repeats) || repeats < 1) { console.error(usage); process.exit(2) }
  const res = runSheetTest({ runId, budgetUsd, repeats })
  const md = formatSheetReport(res.summary, res.run, res.rows.filter(r => r.status === 'failed'))
  writeFileSync(join(res.dir, 'report.md'), md)
  console.log(md)
  if (res.stoppedBy === 'no-claude') { console.error('claude is not on the PATH. Install Claude Code or fix PATH, then rerun.'); process.exit(1) }
  if (res.stoppedBy === 'failures') { console.error(`Stopped after ${MAX_FAILURE_STREAK} failed calls in a row. Last error: ${res.lastError}. Rerun to resume.`); process.exit(1) }
  if (res.stoppedBy === 'budget') console.error('Stopped at the budget cap; the run is partial. Raise --budget-usd and rerun to continue.')
}
