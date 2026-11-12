#!/usr/bin/env node
// Persona test: node evals/persona.mjs --run-id <id> [--budget-usd 10] [--repeats 3] [--fixture <dir>] [--voters <file>]
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { claudeArgv } from './lib/claude.mjs'
import { RUNS_ROOT } from './lib/runstore.mjs'
import { scriptCommit } from './probe.mjs'
import { runVoterTest, MAX_FAILURE_STREAK } from './lib/voter-runner.mjs'
import {
  loadVoters, VOTERS_PATH, VERSIONS, JUDGE_MODEL, JUDGE_SCHEMA, votePromptFor, judgePrompt,
  ballotMeasures, summarize, formatPersonaReport,
} from './lib/persona-core.mjs'

export const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/2026-11-11-cli-language', import.meta.url))

export const PERSONA_TEST = {
  kind: 'persona',
  versions: VERSIONS,
  votePrompt: (version, voter, _i, dossierText, order) => votePromptFor(version, voter, dossierText, order),
  judge: { model: JUDGE_MODEL, schema: JUDGE_SCHEMA, prompt: judgePrompt },
  measure: (j, b) => ballotMeasures(j, b),
}

export function runPersonaTest({
  runId, budgetUsd = 10, repeats = 3, root = RUNS_ROOT, runner, argv0 = claudeArgv(),
  scriptCommit: commit = scriptCommit(), voters = loadVoters(), fixtureDir = FIXTURE_DIR,
}) {
  const res = runVoterTest({ runId, budgetUsd, repeats, root, runner, argv0, commit, voters, fixtureDir, test: PERSONA_TEST })
  return { ...res, summary: summarize(res.results, voters.voters) }
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const usage = 'usage: node evals/persona.mjs --run-id <id> [--budget-usd 10] [--repeats 3] [--fixture <dir>] [--voters <file>]'
  const runId = arg('run-id')
  const budgetUsd = Number(arg('budget-usd', 10))
  const repeats = Number(arg('repeats', 3))
  if (!runId || !Number.isFinite(budgetUsd) || budgetUsd <= 0 || !Number.isInteger(repeats) || repeats < 1) { console.error(usage); process.exit(2) }
  const fixtureDir = arg('fixture', FIXTURE_DIR)
  const voters = loadVoters(arg('voters', VOTERS_PATH))
  const res = runPersonaTest({ runId, budgetUsd, repeats, fixtureDir, voters })
  const md = formatPersonaReport(res.summary, res.run, res.rows.filter(r => r.status === 'failed'))
  writeFileSync(join(res.dir, 'report.md'), md)
  console.log(md)
  if (res.stoppedBy === 'no-claude') { console.error('claude is not on the PATH. Install Claude Code or fix PATH, then rerun.'); process.exit(1) }
  if (res.stoppedBy === 'failures') { console.error(`Stopped after ${MAX_FAILURE_STREAK} failed calls in a row. Last error: ${res.lastError}. Rerun to resume.`); process.exit(1) }
  if (res.stoppedBy === 'budget') console.error('Stopped at the budget cap; the run is partial. Raise --budget-usd and rerun to continue.')
}
