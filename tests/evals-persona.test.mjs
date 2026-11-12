import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadVoters, parseCriteria, identityFor, votePromptFor, orderFor, VERSIONS } from '../evals/lib/persona-core.mjs'

const voters = loadVoters()
const nightly = voters.voters.find(v => v.name.startsWith('Nightly-job owner'))

test('the voters file holds the 7 first-run voters and a hash', () => {
  assert.equal(voters.voters.length, 7)
  assert.match(voters.hash, /^[0-9a-f]{8}$/)
  for (const v of voters.voters) {
    assert.ok(v.name && v.model && v.criteria && v.description, v.name)
    assert.equal(parseCriteria(v.criteria).cares.length, 3, v.name)
  }
})

test('parseCriteria splits the criteria sheet', () => {
  const c = parseCriteria(nightly.criteria)
  assert.deepEqual(c.cares, ['startup time per call', 'total runtime over 500 calls', 'predictable memory'])
  assert.equal(c.accepts, 'a slightly slower single run if the total fits the window')
  assert.equal(c.rejects, 'anything that risks missing the 2-hour window')
})

test('v1 has the name and description and no criteria; v2 is production; v3 has the criteria and no name', () => {
  const v1 = identityFor('v1', nightly)
  assert.ok(v1.includes(nightly.name) && v1.includes(nightly.description))
  assert.ok(!/Cares about|Accepts:|Rejects:/.test(v1))
  for (const item of parseCriteria(nightly.criteria).cares) assert.ok(!v1.includes(item), item)
  assert.equal(identityFor('v2', nightly), `You are a voter on a decision panel. Your persona: ${nightly.name}.\nYour criteria sheet:\n${nightly.criteria}`)
  const v3 = identityFor('v3', nightly)
  assert.ok(v3.includes(nightly.criteria))
  assert.ok(!v3.includes(nightly.name) && !v3.includes('persona'))
  assert.throws(() => identityFor('v4', nightly))
})

test('the versions differ only in the identity block', () => {
  const tail = p => p.slice(p.indexOf('\n\nRank every option'))
  const prompts = VERSIONS.map(v => votePromptFor(v, nightly, 'DOSSIER', ['M', 'K']))
  assert.equal(new Set(prompts.map(tail)).size, 1)
  assert.equal(new Set(prompts).size, 3)
})

test('orderFor matches the production voter order and is stable', () => {
  const labels = ['B', 'D', 'F', 'G', 'H', 'J', 'K']
  const a = orderFor(20261112, 3, labels)
  assert.deepEqual(a, orderFor(20261112, 3, labels))
  assert.deepEqual([...a].sort(), [...labels].sort())
  assert.notDeepEqual(orderFor(20261112, 3, labels), orderFor(20261112, 4, labels))
})

import { judgePrompt, JUDGE_SCHEMA, ballotMeasures, kendall, stability, summarize, verdicts, formatPersonaReport } from '../evals/lib/persona-core.mjs'

const opts = [{ label: 'M', description: 'Option M text' }, { label: 'K', description: 'Option K text' }, { label: 'P', description: 'Option P text' }]
const ballot = {
  ranking: ['M', 'K', 'P'],
  reasons: [
    { higher: 'M', lower: 'K', reason: 'starts faster', cites: ['M-C1'] },
    { higher: 'K', lower: 'P', reason: 'nicer logo', cites: ['K-C2'] },
  ],
  flipCondition: 'x', unacceptable: [], hybrid: '',
}

test('the judge prompt numbers the criteria and never names the version or the voter', () => {
  const p = judgePrompt(nightly, ballot, opts)
  assert.match(p, /cares1: startup time per call/)
  assert.match(p, /cares3: predictable memory/)
  assert.match(p, /rejects: anything that risks missing the 2-hour window/)
  assert.match(p, /0\. M over K: starts faster/)
  assert.match(p, /Option P text/)
  assert.ok(!/\bv[123]\b|version/i.test(p))
  assert.ok(!p.includes(nightly.name))
  assert.deepEqual(JUDGE_SCHEMA.required, ['reasons', 'rejectsViolations'])
})

test('ballotMeasures counts tied reasons, the top criterion, and violations', () => {
  const j = { reasons: [{ index: 0, serves: 'cares1', note: '' }, { index: 1, serves: 'none', note: '' }], rejectsViolations: [{ higher: 'K', lower: 'P', note: '' }] }
  assert.deepEqual(ballotMeasures(j, ballot), { tiedShare: 0.5, topUsed: true, violations: 1 })
  assert.deepEqual(ballotMeasures({ reasons: [], rejectsViolations: [] }, ballot), { tiedShare: 0, topUsed: false, violations: 0 })
})

test('kendall counts pairs in a different order; stability summarizes repeats', () => {
  assert.equal(kendall(['A', 'B', 'C'], ['A', 'B', 'C']), 0)
  assert.equal(kendall(['A', 'B', 'C'], ['C', 'B', 'A']), 3)
  assert.equal(kendall(['A', 'B', 'C'], ['B', 'A', 'C']), 1)
  assert.deepEqual(stability([['A', 'B', 'C'], ['A', 'B', 'C'], ['B', 'A', 'C']]), { sameWinner: 2, spread: 2 / 3 })
  assert.deepEqual(stability([['A', 'B']]), { sameWinner: 1, spread: null })
  assert.deepEqual(stability([]), { sameWinner: 0, spread: null })
})

const result = (voter, version, attempt, ranking, tiedShare) => ({
  voter, version, attempt, status: 'valid', ranking, measures: { tiedShare, topUsed: tiedShare > 0, violations: 0 },
})

test('summarize gives per-version means and per-voter cells', () => {
  const vs = [{ name: 'A' }, { name: 'B' }]
  const results = [
    result('A', 'v1', 1, ['M', 'K'], 1), result('A', 'v1', 2, ['M', 'K'], 1),
    result('B', 'v1', 1, ['K', 'M'], 0.5), { voter: 'B', version: 'v1', attempt: 2, status: 'invalid' },
    { voter: 'A', version: 'v2', attempt: 1, status: 'missing' },
  ]
  const s = summarize(results, vs, ['v1', 'v2'])
  assert.equal(s.byVersion.v1.valid, 3)
  assert.equal(s.byVersion.v1.invalid, 1)
  assert.equal(s.byVersion.v2.missing, 1)
  assert.equal(s.byVersion.v1.tiedShare, 2.5 / 3)
  assert.equal(s.byVersion.v1.spread, 0)
  assert.equal(s.byVersion.v2.tiedShare, null)
  assert.equal(s.byVoter.find(c => c.voter === 'A' && c.version === 'v1').sameWinner, 2)
})

test('verdicts need a 0.10 tied-share gain and no higher spread', () => {
  const by = {
    v1: { tiedShare: 0.60, spread: 2 },
    v2: { tiedShare: 0.70, spread: 2 },
    v3: { tiedShare: 0.80, spread: 1 },
  }
  assert.deepEqual(verdicts(by), ['v2 beats v1', 'v3 beats v1', 'v3 beats v2'])
  assert.deepEqual(verdicts({ v1: { tiedShare: 0.5, spread: 1 }, v2: { tiedShare: 0.9, spread: 3 }, v3: { tiedShare: null, spread: null } }), [])
})

test('formatPersonaReport shows the version table, voter rows, and verdicts', () => {
  const vs = [{ name: 'A' }]
  const results = [result('A', 'v1', 1, ['M', 'K'], 1), result('A', 'v2', 1, ['M', 'K'], 0.5), result('A', 'v3', 1, ['M', 'K'], 0.5)]
  const md = formatPersonaReport(summarize(results, vs), { runId: 'r', scriptCommit: 'abc/1234', budgetUsd: 10, spent: 1.5 }, [])
  assert.match(md, /# Persona test r/)
  assert.match(md, /\| v1 \| 1 \| 0 \| 0 \| 1\.00 \|/)
  assert.match(md, /\| A \| v1 \|/)
  assert.match(md, /v1 beats v2/)
  assert.match(md, /at most 21 ballots/)
})
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join as pjoin } from 'node:path'
import { runPersonaTest, FIXTURE_DIR } from '../evals/persona.mjs'
import { loadFixture } from '../evals/lib/fixture.mjs'
import { H } from '../evals/lib/helpers.mjs'

const fx = loadFixture(FIXTURE_DIR)
const anId = [...H.dossierIds(fx.run.dossier)].find(id => /-C\d+$/.test(id))
const tmpRoot = () => mkdtempSync(pjoin(tmpdir(), 'cm-persona-'))

// A fake model: votes in the order it was shown, citing a real claim; the judge ties every reason to cares1.
const fakeModel = (cmd, args, opts) => {
  const schema = JSON.parse(args[args.indexOf('--json-schema') + 1])
  let out
  if (schema.properties.ranking) {
    const labels = opts.input.match(/Labels: ([A-Z, ]+)\./)[1].split(', ')
    out = {
      ranking: labels,
      reasons: labels.slice(1).map((lower, i) => ({ higher: labels[i], lower, reason: 'r', cites: [anId] })),
      flipCondition: 'x', unacceptable: [], hybrid: '',
    }
  } else {
    const n = (opts.input.match(/^\d+\. /gm) || []).length
    out = { reasons: Array.from({ length: n }, (_, index) => ({ index, serves: 'cares1', note: '' })), rejectsViolations: [] }
  }
  return { status: 0, stdout: JSON.stringify({ is_error: false, total_cost_usd: 0.01, duration_ms: 10, structured_output: out }), stderr: '' }
}

const base = { scriptCommit: 'abc', argv0: ['claude'], budgetUsd: 10 }

test('runPersonaTest runs every voter call, then a judge call per valid ballot, with no tools', () => {
  const calls = []
  const runner = (cmd, args, opts) => { calls.push(args); return fakeModel(cmd, args, opts) }
  const res = runPersonaTest({ ...base, runId: 'p1', repeats: 1, root: tmpRoot(), runner })
  assert.equal(calls.length, 7 * 3 * 2)
  for (const a of calls) {
    assert.equal(a[a.indexOf('--tools') + 1], '')
    assert.ok(!a.includes('--allowedTools'))
  }
  const judgeCalls = calls.filter(a => a[a.indexOf('--model') + 1] === 'opus' && !a[a.indexOf('--json-schema') + 1].includes('ranking'))
  assert.equal(judgeCalls.length, 21)
  assert.equal(res.summary.byVersion.v2.valid, 7)
  assert.equal(res.summary.byVersion.v2.tiedShare, 1)
  assert.equal(res.stoppedBy, null)
})

test('a rerun resumes and makes no new calls', () => {
  const root = tmpRoot()
  runPersonaTest({ ...base, runId: 'p2', repeats: 1, root, runner: fakeModel })
  let calls = 0
  const res = runPersonaTest({ ...base, runId: 'p2', repeats: 1, root, runner: (...a) => { calls++; return fakeModel(...a) } })
  assert.equal(calls, 0)
  assert.equal(res.summary.byVersion.v1.valid, 7)
})

test('an invalid ballot is counted and never judged', () => {
  let judged = 0
  const runner = (cmd, args, opts) => {
    const r = fakeModel(cmd, args, opts)
    const j = JSON.parse(r.stdout)
    if (j.structured_output.ranking) j.structured_output.reasons.forEach(x => { x.cites = [] })
    else judged++
    return { ...r, stdout: JSON.stringify(j) }
  }
  const res = runPersonaTest({ ...base, runId: 'p3', repeats: 1, root: tmpRoot(), runner })
  assert.equal(judged, 0)
  assert.equal(res.summary.byVersion.v1.invalid, 7)
})

test('the budget stops the run and 3 failures in a row stop it with the last error', () => {
  const pricey = (...a) => { const r = fakeModel(...a); const j = JSON.parse(r.stdout); j.total_cost_usd = 0.4; return { ...r, stdout: JSON.stringify(j) } }
  const res = runPersonaTest({ ...base, runId: 'p4', repeats: 1, root: tmpRoot(), runner: pricey, budgetUsd: 1 })
  assert.equal(res.stoppedBy, 'budget')
  const broken = () => ({ status: 1, stdout: JSON.stringify({ is_error: true, subtype: 'error_during_execution', result: 'boom' }), stderr: '' })
  const res2 = runPersonaTest({ ...base, runId: 'p5', repeats: 1, root: tmpRoot(), runner: broken })
  assert.equal(res2.stoppedBy, 'failures')
  assert.match(res2.lastError, /boom/)
  assert.equal(res2.rows.length, 3)
})

test('no claude on the PATH stops before any call', () => {
  const res = runPersonaTest({ ...base, runId: 'p6', repeats: 1, root: tmpRoot(), runner: fakeModel, argv0: null })
  assert.equal(res.stoppedBy, 'no-claude')
  assert.equal(res.rows.length, 0)
})

test('summarize counts first choices per version, and the report shows panel diversity', () => {
  const vs = [{ name: 'A' }, { name: 'B' }]
  const results = [
    result('A', 'v1', 1, ['M', 'K'], 1), result('B', 'v1', 1, ['M', 'K'], 1),
    result('A', 'v2', 1, ['M', 'K'], 1), result('B', 'v2', 1, ['K', 'M'], 1),
    { voter: 'A', version: 'v3', attempt: 1, status: 'invalid' },
  ]
  const s = summarize(results, vs, ['v1', 'v2', 'v3'])
  assert.deepEqual(s.byVersion.v1.firstChoices, { M: 2 })
  assert.equal(s.byVersion.v1.distinctFirst, 1)
  assert.equal(s.byVersion.v1.topFirstShare, 1)
  assert.deepEqual(s.byVersion.v2.firstChoices, { M: 1, K: 1 })
  assert.equal(s.byVersion.v2.topFirstShare, 0.5)
  assert.equal(s.byVersion.v3.distinctFirst, 0)
  assert.equal(s.byVersion.v3.topFirstShare, null)
  const md = formatPersonaReport(s, { runId: 'r', scriptCommit: 'x', budgetUsd: 10, spent: 1 }, [])
  assert.match(md, /\| v2 \| 2 \| 0\.50 \| K 1, M 1 \|/)
})
