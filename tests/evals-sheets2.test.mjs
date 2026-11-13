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

import { SHEET2_VERSIONS, SHEETS2_VOTERS_PATH, PRIORITY_LINES, ASSESSMENT_RULE, sheet2Text, sheet2Identity, sheet2VotePrompt, BALLOT2_SCHEMA, voteSchema2 } from '../evals/lib/sheet2-core.mjs'

const v2 = loadVoters(SHEETS2_VOTERS_PATH)
const prod = loadVoters(PROD_PATH)
const rel = v2.voters.find(v => v.name === 'Release engineer')
const order = ['A', 'B', 'C']
const prompt = version => sheet2VotePrompt(version, rel, 'DOSSIER', order)

test('V0 is the production sheet and prompt, word for word', () => {
  assert.deepEqual(SHEET2_VERSIONS, ['V0', 'V1', 'V2', 'V3', 'V4'])
  v2.voters.forEach((v, i) => assert.equal(sheet2Text('V0', v), prod.voters[i].criteria, v.name))
  const p = prod.voters.find(v => v.name === 'Release engineer')
  assert.equal(prompt('V0'), H.votePrompt(p, 'DOSSIER', order))
  assert.throws(() => sheet2Text('V9', rel))
})

test('V1 shows a serves and a fails line under each numbered item', () => {
  assert.equal(sheet2Text('V1', rel), [
    'Cares about (in order):',
    '1. reproducible builds for 3 OSes from one CI',
    '   Serves it: One CI pipeline builds all 3 OS binaries from the same source.',
    '   Fails it: A release needs a separate machine or manual steps per OS.',
    '2. code signing on macOS and Windows',
    '   Serves it: CI signs and notarizes the artifacts with standard tools.',
    '   Fails it: Signing needs manual steps, or the artifacts are hard to sign.',
    '3. small artifacts',
    '   Serves it: Each release download is a few megabytes.',
    '   Fails it: Each release ships a bundled runtime or a large download.',
    'Accepts: longer CI builds',
    'Rejects: per-OS build machines kept by hand',
  ].join('\n'))
  assert.equal(sheet2Text('V4', rel), sheet2Text('V1', rel))
  for (const v of ['V0', 'V2', 'V3']) assert.equal(sheet2Text(v, rel), sheet2Text('V0', rel))
})

test('V2 adds the 3 priority lines after the sheet, inside the identity block', () => {
  assert.deepEqual(PRIORITY_LINES, [
    'Weigh your items in order: item 1 counts more than item 2, and item 2 more than item 3.',
    'Give up what your Accepts line names before you give up any item.',
    'Rank an option that has what your Rejects line names below the options that do not.',
  ])
  assert.equal(sheet2Identity('V2', rel), [sheet2Identity('V0', rel), ...PRIORITY_LINES].join('\n'))
  assert.equal(sheet2Identity('V4', rel), [sheet2Identity('V1', rel), ...PRIORITY_LINES].join('\n'))
  for (const v of ['V0', 'V1', 'V3']) assert.ok(!sheet2Identity(v, rel).includes(PRIORITY_LINES[0]), v)
})

test('V3 adds the assessment rule as the first ballot rule, and nothing else', () => {
  assert.equal(ASSESSMENT_RULE, '- assessment: write this first. For each option, one note on how it serves or fails your items, citing dossier IDs. Then rank.')
  assert.ok(prompt('V3').includes(`Ballot rules:\n${ASSESSMENT_RULE}\n- ranking: `))
  assert.equal(prompt('V3').replace(`${ASSESSMENT_RULE}\n`, ''), prompt('V0'))
  assert.ok(!prompt('V0').includes('assessment'))
})

test('only the identity block and the ballot rules differ between versions', () => {
  const strip = (version, p) => p.replace(sheet2Identity(version, rel), 'ID').replace(`${ASSESSMENT_RULE}\n`, '')
  for (const v of SHEET2_VERSIONS) assert.equal(strip(v, prompt(v)), strip('V0', prompt('V0')), v)
})

test('the extended schema lists assessment first and keeps every production field', () => {
  assert.deepEqual(Object.keys(BALLOT2_SCHEMA.properties), ['assessment', ...Object.keys(H.BALLOT_SCHEMA.properties)])
  for (const k of Object.keys(H.BALLOT_SCHEMA.properties)) assert.equal(JSON.stringify(BALLOT2_SCHEMA.properties[k]), JSON.stringify(H.BALLOT_SCHEMA.properties[k]), k)
  assert.deepEqual(BALLOT2_SCHEMA.required, ['assessment', ...H.BALLOT_SCHEMA.required])
  assert.equal(voteSchema2('V3'), BALLOT2_SCHEMA)
  assert.equal(voteSchema2('V4'), BALLOT2_SCHEMA)
  for (const v of ['V0', 'V1', 'V2']) assert.equal(voteSchema2(v), H.BALLOT_SCHEMA, v)
})

test('a V3 ballot with an assessment passes normalizeBallot and validateBallot', () => {
  const labels = ['A', 'B', 'C']
  const ids = new Set(['A-C1'])
  const raw = {
    assessment: labels.map(option => ({ option, note: 'n A-C1' })),
    ranking: labels, reasons: [{ higher: 'A', lower: 'B', reason: 'r', cites: ['A-C1'] }, { higher: 'B', lower: 'C', reason: 'r', cites: ['A-C1'] }],
    flipCondition: 'x', unacceptable: [], hybrid: '',
  }
  const ballot = H.normalizeBallot(raw, labels, ids)
  assert.equal(H.validateBallot(ballot, labels, ids).valid, true)
  assert.equal(ballot.assessment.length, 3)
})

import { judgePrompt } from '../evals/lib/persona-core.mjs'
import { judge2Prompt } from '../evals/lib/sheet2-core.mjs'

test('the judge prompt holds the definitions, keeps the production rules, and names no version or voter', () => {
  const ballot = { ranking: ['A', 'B'], reasons: [{ higher: 'A', lower: 'B', reason: 'smaller binary' }] }
  const options = [{ label: 'A', description: 'Go' }, { label: 'B', description: 'Python' }]
  const p = judge2Prompt(rel, ballot, options)
  assert.ok(p.includes([
    'cares1: reproducible builds for 3 OSes from one CI',
    '  serves it: One CI pipeline builds all 3 OS binaries from the same source.',
    '  fails it: A release needs a separate machine or manual steps per OS.',
  ].join('\n')))
  assert.ok(p.includes('cares3: small artifacts'))
  assert.ok(p.includes('accepts: longer CI builds\nrejects: per-OS build machines kept by hand'))
  // The same frame and rules as the production judge prompt.
  const old = judgePrompt({ criteria: sheet2Text('V0', rel) }, ballot, options)
  assert.equal(p.split('\nThe options:')[1], old.split('\nThe options:')[1])
  assert.equal(p.split('\n')[0], old.split('\n')[0])
  assert.ok(!/\bV[0-4]\b/.test(p))
  for (const v of v2.voters) assert.ok(!p.includes(v.name), v.name)
})

import { assessmentComplete, sheet2Measures, summarizeSheets2, formatSheet2Report } from '../evals/lib/sheet2-core.mjs'
import { differences } from '../evals/lib/sheet-core.mjs'

const judged = (...serves) => ({ reasons: serves.map((s, index) => ({ index, serves: s, note: '' })), rejectsViolations: [] })
const b3 = assessment => ({ ranking: ['A', 'B', 'C'], reasons: [{}, {}], assessment })

test('assessmentComplete needs a non-empty note for every ranked option', () => {
  assert.equal(assessmentComplete(b3([{ option: 'A', note: 'x' }, { option: 'Option b', note: 'y' }, { option: 'c', note: 'z' }])), true)
  assert.equal(assessmentComplete(b3([{ option: 'A', note: 'x' }, { option: 'B', note: ' ' }, { option: 'C', note: 'z' }])), false)
  assert.equal(assessmentComplete(b3([{ option: 'A', note: 'x' }, { option: 'B', note: 'y' }])), false)
  assert.equal(assessmentComplete(b3(undefined)), false)
})

test('sheet2Measures gives adherence, top weight, violations, and assessment only for V3 and V4', () => {
  assert.deepEqual(sheet2Measures(judged('cares1', 'none'), b3([]), 'V0'), { adherence: 0.5, topWeight: 1, violations: 0, assessed: null })
  assert.equal(sheet2Measures(judged('cares2', 'rejects'), b3([]), 'V3').assessed, 0)
  const full = b3(['A', 'B', 'C'].map(option => ({ option, note: 'n' })))
  assert.equal(sheet2Measures(judged('cares2', 'accepts'), full, 'V4').assessed, 1)
  assert.equal(sheet2Measures(judged('cares2', 'accepts'), full, 'V4').adherence, 1)
})

const res = (voter, version, attempt, ranking, m) => ({ voter, version, attempt, status: 'valid', ranking, measures: m })

test('summarizeSheets2 drops coverage, adds assessment coverage, and differences use V0 as the base', () => {
  const vs = [{ name: 'A' }]
  const m = (adherence, assessed) => ({ adherence, topWeight: 1, violations: 0, assessed })
  const results = [
    res('A', 'V0', 1, ['X', 'Y'], m(0.6, null)),
    res('A', 'V3', 1, ['X', 'Y'], m(0.8, 1)), res('A', 'V3', 2, ['X', 'Y'], m(0.8, 0)),
  ]
  const s = summarizeSheets2(results, vs, ['V0', 'V3'])
  assert.equal('coverage' in s.byVersion.V0, false)
  assert.equal(s.byVersion.V0.assessed, null)
  assert.equal(s.byVersion.V3.assessed, 0.5)
  assert.deepEqual(differences(s.byVersion, 'V0').map(d => `${d.version} ${d.measure} ${d.gap.toFixed(2)}`), ['V3 adherence 0.20'])
})

test('formatSheet2Report shows the table, the differences from V0, the headline, and the sample-size warning', () => {
  const vs = [{ name: 'A' }]
  const m = (adherence, assessed) => ({ adherence, topWeight: 1, violations: 0, assessed })
  const results = [res('A', 'V0', 1, ['X', 'Y'], m(0.6, null)), res('A', 'V4', 1, ['X', 'Y'], m(0.9, 1))]
  const md = formatSheet2Report(summarizeSheets2(results, vs, ['V0', 'V4']), { runId: 'r', scriptCommit: 'x', budgetUsd: 15, spent: 2 }, [])
  assert.match(md, /# Sheet v2 test r/)
  assert.match(md, /\| V0 \| 1 \| 0 \| 0 \| 0\.60 \| 1\.00 \| 0\.00 \|/)
  assert.match(md, /\| 1\.00 \|$/m)
  assert.match(md, /V4: adherence \+0\.30/)
  assert.match(md, /V4 against V0 is the headline/)
  assert.match(md, /judged V3 and V4 ballots/)
  assert.match(md, /at most 21 ballots/)
  assert.ok(!/Coverage/.test(md))
})
