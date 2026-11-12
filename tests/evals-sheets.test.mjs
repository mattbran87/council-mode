import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadVoters, parseCriteria } from '../evals/lib/persona-core.mjs'
import { SHEET_VERSIONS, SHEETS_VOTERS_PATH, sheetText, referenceCriteria, OWN_LINES, sheetIdentity } from '../evals/lib/sheet-core.mjs'

const voters = loadVoters(SHEETS_VOTERS_PATH)
const rel = voters.voters.find(v => v.name === 'Release engineer')
const relIndex = voters.voters.indexOf(rel)

test('every sheet voter has 5 ranked items, Accepts, and Rejects, and the reference parses back to them', () => {
  assert.equal(voters.voters.length, 7)
  for (const v of voters.voters) {
    assert.equal(v.cares.length, 5, v.name)
    assert.ok(v.accepts && v.rejects, v.name)
    const c = parseCriteria(referenceCriteria(v))
    assert.deepEqual(c.cares, v.cares, v.name)
  }
})

test('the 5 variants show the lines the spec lists', () => {
  const s = version => sheetText(version, rel, voters.seed, relIndex)
  assert.equal(s('S0'), 'Cares about (in order): reproducible builds for 3 OSes from one CI, code signing on macOS and Windows, small artifacts\nAccepts: longer CI builds\nRejects: per-OS build machines kept by hand')
  assert.match(s('S1'), /^Cares about \(in no particular order\): /)
  assert.deepEqual(parseCriteria(s('S1')).cares.slice().sort(), rel.cares.slice(0, 3).sort())
  assert.equal(s('S1'), sheetText('S1', rel, voters.seed, relIndex))
  assert.equal(s('S2'), 'Cares about (in order): reproducible builds for 3 OSes from one CI, code signing on macOS and Windows, small artifacts')
  assert.deepEqual(parseCriteria(s('S3')).cares, rel.cares.slice(0, 2))
  assert.deepEqual(parseCriteria(s('S4')).cares, rel.cares)
  assert.equal(s('S4'), referenceCriteria(rel))
  assert.throws(() => sheetText('S9', rel, voters.seed, relIndex))
})

test('the S1 shuffle changes the order for at least one voter', () => {
  const moved = voters.voters.some((v, i) => parseCriteria(sheetText('S1', v, voters.seed, i)).cares.join() !== v.cares.slice(0, 3).join())
  assert.ok(moved)
})

test('each version lists the reference lines its sheet shows', () => {
  assert.deepEqual([...OWN_LINES.S0].sort(), ['accepts', 'cares1', 'cares2', 'cares3', 'rejects'])
  assert.deepEqual([...OWN_LINES.S1].sort(), [...OWN_LINES.S0].sort())
  assert.deepEqual([...OWN_LINES.S2].sort(), ['cares1', 'cares2', 'cares3'])
  assert.deepEqual([...OWN_LINES.S3].sort(), ['accepts', 'cares1', 'cares2', 'rejects'])
  assert.equal(OWN_LINES.S4.size, 7)
  assert.deepEqual(SHEET_VERSIONS, ['S0', 'S1', 'S2', 'S3', 'S4'])
})

test('the identity block is the production one with the variant sheet', () => {
  const id = sheetIdentity('S2', rel, voters.seed, relIndex)
  assert.equal(id, `You are a voter on a decision panel. Your persona: ${rel.name}.\nYour criteria sheet:\n${sheetText('S2', rel, voters.seed, relIndex)}`)
})

import { sheetMeasures, summarizeSheets, differences, formatSheetReport, BARS } from '../evals/lib/sheet-core.mjs'

const ballot3 = { ranking: ['A', 'B', 'C', 'D'], reasons: [{}, {}, {}] }
const judged = (...serves) => ({ reasons: serves.map((s, index) => ({ index, serves: s, note: '' })), rejectsViolations: [] })

test('sheetMeasures splits adherence from coverage and weighs the top item', () => {
  // cares4 is outside S0's sheet but inside the reference.
  assert.deepEqual(sheetMeasures(judged('cares1', 'cares4', 'none'), ballot3, 'S0'), { adherence: 1 / 3, coverage: 2 / 3, topWeight: 0.5, violations: 0 })
  assert.deepEqual(sheetMeasures(judged('cares4', 'cares5', 'rejects'), ballot3, 'S4'), { adherence: 1, coverage: 1, topWeight: 0, violations: 0 })
  // S2 has no Accepts or Rejects lines, so a rejects-based reason counts for coverage only.
  assert.equal(sheetMeasures(judged('rejects', 'cares1', 'cares2'), ballot3, 'S2').adherence, 2 / 3)
  assert.equal(sheetMeasures(judged('accepts', 'none', 'none'), ballot3, 'S0').topWeight, null)
  assert.equal(sheetMeasures({ reasons: [], rejectsViolations: [{}, {}] }, ballot3, 'S0').violations, 2)
})

const res = (voter, version, attempt, ranking, m) => ({ voter, version, attempt, status: 'valid', ranking, measures: m })
const m = (adherence, coverage, topWeight, violations) => ({ adherence, coverage, topWeight, violations })

test('summarizeSheets gives per-version means, stability, and diversity', () => {
  const vs = [{ name: 'A' }, { name: 'B' }]
  const results = [
    res('A', 'S0', 1, ['X', 'Y'], m(1, 1, 1, 0)), res('A', 'S0', 2, ['X', 'Y'], m(0.5, 1, null, 1)),
    res('B', 'S0', 1, ['Y', 'X'], m(0.5, 0.5, 0, 0)),
    { voter: 'B', version: 'S1', attempt: 1, status: 'invalid' },
  ]
  const s = summarizeSheets(results, vs, ['S0', 'S1'])
  assert.equal(s.byVersion.S0.adherence, 2 / 3)
  assert.equal(s.byVersion.S0.topWeight, 0.5)
  assert.equal(s.byVersion.S0.violations, 1 / 3)
  assert.equal(s.byVersion.S0.topFirstShare, 2 / 3)
  assert.equal(s.byVersion.S0.spread, 0)
  assert.equal(s.byVersion.S1.invalid, 1)
  assert.equal(s.byVersion.S1.adherence, null)
})

test('differences compares each variant with S0 against the bars, with the sign', () => {
  const base = { adherence: 0.9, coverage: 0.8, topWeight: 0.5, topFirstShare: 0.7, violations: 0.2 }
  const by = {
    S0: base,
    S1: { ...base, topWeight: 0.4 },
    S2: { ...base, violations: 0.9, adherence: 0.85 },
    S3: { ...base, coverage: 0.65, topFirstShare: 0.9 },
    S4: { ...base, adherence: null },
  }
  assert.deepEqual(differences(by).map(d => `${d.version} ${d.measure} ${d.gap.toFixed(2)}`), [
    'S1 topWeight -0.10', 'S2 violations 0.70', 'S3 coverage -0.15', 'S3 topFirstShare 0.20',
  ])
  assert.equal(BARS.violations, 0.5)
})

test('formatSheetReport shows the version table, the differences, and the sample-size warning', () => {
  const vs = [{ name: 'A' }]
  const results = ['S0', 'S1'].map(v => res('A', v, 1, ['X', 'Y'], m(v === 'S0' ? 1 : 0.5, 1, 1, 0)))
  const md = formatSheetReport(summarizeSheets(results, vs, ['S0', 'S1']), { runId: 'r', scriptCommit: 'x', budgetUsd: 15, spent: 2 }, [])
  assert.match(md, /# Sheet test r/)
  assert.match(md, /\| S0 \| 1 \| 0 \| 0 \| 1\.00 \| 1\.00 \| 1\.00 \| 0\.00 \|/)
  assert.match(md, /S1: adherence -0\.50/)
  assert.match(md, /at most 21 ballots/)
})

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join as pjoin } from 'node:path'
import { runSheetTest, SHEETS_FIXTURE_DIR } from '../evals/sheets.mjs'
import { loadFixture } from '../evals/lib/fixture.mjs'
import { H } from '../evals/lib/helpers.mjs'

const fx = loadFixture(SHEETS_FIXTURE_DIR)
const anId = [...H.dossierIds(fx.run.dossier)].find(id => /-C\d+$/.test(id))
const tmpRoot = () => mkdtempSync(pjoin(tmpdir(), 'cm-sheets-'))

// Votes in the shown order citing a real claim; the judge ties every reason to cares4.
const fakeModel = (cmd, args, opts) => {
  const schema = JSON.parse(args[args.indexOf('--json-schema') + 1])
  let out
  if (schema.properties.ranking) {
    const labels = opts.input.match(/Labels: ([A-Z, ]+)\./)[1].split(', ')
    out = { ranking: labels, reasons: labels.slice(1).map((lower, i) => ({ higher: labels[i], lower, reason: 'r', cites: [anId] })), flipCondition: 'x', unacceptable: [], hybrid: '' }
  } else {
    const n = (opts.input.match(/^\d+\. /gm) || []).length
    out = { reasons: Array.from({ length: n }, (_, index) => ({ index, serves: 'cares4', note: '' })), rejectsViolations: [] }
  }
  return { status: 0, stdout: JSON.stringify({ is_error: false, total_cost_usd: 0.01, duration_ms: 10, structured_output: out }), stderr: '' }
}

const base = { scriptCommit: 'abc', argv0: ['claude'], budgetUsd: 15 }

test('runSheetTest runs 5 versions, judges against the 5-item reference, and scores adherence per version', () => {
  const prompts = []
  const runner = (cmd, args, opts) => { prompts.push(opts.input); return fakeModel(cmd, args, opts) }
  const res = runSheetTest({ ...base, runId: 's1', repeats: 1, root: tmpRoot(), runner })
  assert.equal(prompts.length, 7 * 5 * 2)
  const judgePrompts = prompts.filter(p => p.startsWith("You check whether a voter's ballot"))
  assert.equal(judgePrompts.length, 35)
  assert.ok(judgePrompts.every(p => /cares5: /.test(p) && !/S[0-4]\b/.test(p)))
  // cares4 is in S4's sheet only.
  assert.equal(res.summary.byVersion.S4.adherence, 1)
  assert.equal(res.summary.byVersion.S0.adherence, 0)
  assert.equal(res.summary.byVersion.S0.coverage, 1)
  assert.equal(res.stoppedBy, null)
})

test('the sheet-test voter prompts carry each variant sheet', () => {
  const prompts = []
  runSheetTest({ ...base, runId: 's2', repeats: 1, root: tmpRoot(), runner: (c, a, o) => { prompts.push(o.input); return fakeModel(c, a, o) } })
  const votes = prompts.filter(p => p.startsWith('You are a voter'))
  assert.equal(votes.filter(p => p.includes('in no particular order')).length, 7)
  assert.equal(votes.filter(p => !p.includes('Rejects:')).length, 7)
})
