import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join as pjoin } from 'node:path'
import { H } from '../evals/lib/helpers.mjs'
import { loadFixture } from '../evals/lib/fixture.mjs'
import { loadVoters } from '../evals/lib/persona-core.mjs'
import { runVoterTest } from '../evals/lib/voter-runner.mjs'
import { SHEETS_FIXTURE_DIR } from '../evals/sheets.mjs'

const fx = loadFixture(SHEETS_FIXTURE_DIR)
const anId = [...H.dossierIds(fx.run.dossier)].find(id => /-C\d+$/.test(id))
const tmpRoot = () => mkdtempSync(pjoin(tmpdir(), 'cm-sheets2-'))

// Votes in the shown order citing a real claim, with an assessment when the schema asks for one.
// The judge ties every reason to cares1.
const fakeModel = (cmd, args, opts) => {
  const schema = JSON.parse(args[args.indexOf('--json-schema') + 1])
  let out
  if (schema.properties.ranking) {
    const labels = opts.input.match(/Labels: ([A-Z, ]+)\./)[1].split(', ')
    out = { ranking: labels, reasons: labels.slice(1).map((lower, i) => ({ higher: labels[i], lower, reason: 'r', cites: [anId] })), flipCondition: 'x', unacceptable: [], hybrid: '' }
    if (schema.properties.assessment) out = { assessment: labels.map(option => ({ option, note: `n ${anId}` })), ...out }
  } else {
    const n = (opts.input.match(/^\d+\. /gm) || []).length
    out = { reasons: Array.from({ length: n }, (_, index) => ({ index, serves: 'cares1', note: '' })), rejectsViolations: [] }
  }
  return { status: 0, stdout: JSON.stringify({ is_error: false, total_cost_usd: 0.01, duration_ms: 10, structured_output: out }), stderr: '' }
}

const base = { scriptCommit: 'abc', argv0: ['claude'], budgetUsd: 15 }

test('runVoterTest sends the schema voteSchema picks for each version, and BALLOT_SCHEMA without the hook', () => {
  const voters = { ...loadVoters(), voters: loadVoters().voters.slice(0, 1) }
  const extra = { type: 'object', properties: { note: { type: 'string' }, ...H.BALLOT_SCHEMA.properties }, required: ['note'] }
  const seen = []
  const runner = (cmd, args, opts) => {
    const schema = JSON.parse(args[args.indexOf('--json-schema') + 1])
    if (schema.properties.ranking) seen.push(`${opts.input.slice(0, 2)} ${'note' in schema.properties}`)
    return fakeModel(cmd, args, opts)
  }
  const make = voteSchema => ({
    kind: 't', versions: ['a', 'b'],
    votePrompt: (version, voter, i, dossierText, order) => `${version}|` + H.votePrompt(voter, dossierText, order),
    judge: { model: 'opus', schema: { type: 'object', properties: { reasons: {} } }, prompt: () => 'judge' },
    measure: () => ({}),
    ...(voteSchema ? { voteSchema } : {}),
  })
  runVoterTest({ ...base, runId: 'h1', repeats: 1, root: tmpRoot(), runner, commit: 'abc', voters, fixtureDir: SHEETS_FIXTURE_DIR, test: make(v => (v === 'b' ? extra : H.BALLOT_SCHEMA)) })
  assert.deepEqual(seen, ['a| false', 'b| true'])
  seen.length = 0
  runVoterTest({ ...base, runId: 'h2', repeats: 1, root: tmpRoot(), runner, commit: 'abc', voters, fixtureDir: SHEETS_FIXTURE_DIR, test: make(null) })
  assert.deepEqual(seen, ['a| false', 'b| false'])
})

import { parseCriteria } from '../evals/lib/persona-core.mjs'

const V2_PATH = new URL('../evals/sheet-voters-5lang-v2.json', import.meta.url)
const PROD_PATH = new URL('../evals/persona-voters-5lang.json', import.meta.url)

test('the v2 voters match the production voters, with a serves and a fails line for each item', () => {
  const v2 = loadVoters(V2_PATH)
  const prod = loadVoters(PROD_PATH)
  assert.equal(v2.seed, prod.seed)
  assert.equal(v2.voters.length, 7)
  v2.voters.forEach((v, i) => {
    const p = prod.voters[i]
    const c = parseCriteria(p.criteria)
    assert.equal(v.name, p.name)
    assert.equal(v.model, p.model)
    assert.deepEqual(v.cares.map(x => x.item), c.cares, v.name)
    assert.equal(v.accepts, c.accepts, v.name)
    assert.equal(v.rejects, c.rejects, v.name)
    for (const x of v.cares) assert.ok(x.serves.trim() && x.fails.trim(), `${v.name}: ${x.item}`)
  })
})
