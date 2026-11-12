# Council Mode Sheet-Quality Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and run the sheet-quality test. It finds out which parts of the voter criteria sheet matter: ranked items, the Accepts and Rejects lines, and the item count.

**Architecture:** Move the persona test's runner into a shared `evals/lib/voter-runner.mjs`, which takes its versions, prompt builder, judge, and measures as arguments. The persona test becomes one caller and keeps its behavior and tests. `evals/lib/sheet-core.mjs` holds the sheet variants, measures, decision rule, and report text. `evals/sheets.mjs` is the second caller.

**Tech Stack:** Node 22 ESM, `node:test`, the Claude Code CLI through `evals/lib/claude.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-12-council-mode-sheet-test-design.md`

---

## Facts every task relies on

- Repo `C:\Users\marko\source\repos\council-mode`, branch `feat/sheet-test`. `npm test` passes (199 tests) before Task 1.
- `evals/persona.mjs` exports `FIXTURE_DIR` and `runPersonaTest(opts)`. Its body is the runner this plan moves. Its CLI takes `--run-id`, `--budget-usd`, `--repeats`, `--fixture`, and `--voters`.
- `evals/lib/persona-core.mjs` exports `loadVoters(path)` (adds `hash`), `parseCriteria`, `identityFor`, `votePromptFor`, `orderFor(seed, index, labels)`, `VERSIONS`, `JUDGE_MODEL` ('opus'), `JUDGE_SCHEMA` (serves enum `cares1`–`cares5`, `accepts`, `rejects`, `none`), `judgePrompt(voter, ballot, options)` (reads `voter.criteria` through `parseCriteria`), `ballotMeasures`, `kendall`, `stability(rankings)` → `{ sameWinner, spread }`, `summarize`, `verdicts`, `formatPersonaReport`, and `evaluate(rows, voters, versions, repeats, labels, ids)`.
- `H` from `evals/lib/helpers.mjs` includes `voterIdentity`, `votePrompt(persona, dossierText, order, identity)`, `BALLOT_SCHEMA`, `normalizeBallot`, `validateBallot`, `dossierIds`, `renderDossier`, `makeRng`, and `shuffle`.
- `evals/persona-voters-5lang.json` holds the 7 follow-up voters (`name`, `model`, `criteria`, `description`). Each `criteria` has 3 lines: `Cares about (in order): a, b, c`, `Accepts: …`, `Rejects: …`.
- Fixture `evals/fixtures/2026-11-12-cli-5lang/` has 6 options.
- Commit messages end with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- All tests are offline: a fake runner and temp run folders, never the real CLI or `~/.claude`.

## File structure

| Path | Responsibility |
| --- | --- |
| `evals/lib/voter-runner.mjs` | Create: the shared runner (calls, budget, resume, failure stop, results) |
| `evals/lib/persona-core.mjs` | Modify: `evaluate` takes a measure function; export `mean` and `firstChoiceStats` |
| `evals/persona.mjs` | Modify: `runPersonaTest` calls the shared runner |
| `evals/sheet-voters-5lang.json` | Create: 7 voters with 5 ranked items, Accepts, Rejects |
| `evals/lib/sheet-core.mjs` | Create: variants, own-sheet lines, measures, summary, differences, report text |
| `evals/sheets.mjs` | Create: `runSheetTest` and the CLI |
| `tests/evals-sheets.test.mjs` | Create: offline tests |
| `evals/README.md` | Modify: a sheet-test section |

---

### Task 1: Move the runner into a shared module

**Files:** Create `evals/lib/voter-runner.mjs`; modify `evals/lib/persona-core.mjs` and `evals/persona.mjs`.

This is a refactor. The existing persona tests are the safety net, and they must pass unchanged.

- [ ] **Step 1: Generalize `evaluate` and share the diversity code in `persona-core.mjs`**

Replace the `mean` constant with an export, add `firstChoiceStats`, and let `evaluate` take a measure function:

```js
export const mean = xs => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)

// Panel diversity: how the first choices of valid ballots spread across options.
export function firstChoiceStats(rankings) {
  const firstChoices = {}
  for (const r of rankings) firstChoices[r[0]] = (firstChoices[r[0]] || 0) + 1
  const counts = Object.values(firstChoices)
  const total = counts.reduce((s, x) => s + x, 0)
  return { firstChoices, distinctFirst: counts.length, topFirstShare: total ? Math.max(...counts) / total : null }
}
```

In `summarize`, replace the 5 lines that build `firstChoices`, `firstCounts`, and `validCount`, and the 3 matching fields, with:

```js
    byVersion[version] = {
      ...firstChoiceStats(rs.filter(x => x.status === 'valid').map(x => x.ranking)),
```

Change `evaluate`'s signature and its measures line:

```js
// measure(judgment, ballot, version) turns a judge reply into the measures for one ballot.
export function evaluate(rows, voters, versions, repeats, labels, ids, measure = (j, b) => ballotMeasures(j, b)) {
```

```js
        out.push({ ...base, status: 'valid', ranking: ballot.ranking, measures: judge ? measure(judge.output, ballot, version) : null })
```

- [ ] **Step 2: Create `evals/lib/voter-runner.mjs`**

```js
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

  for (const c of cells) {
    const order = orderFor(voters.seed, c.i, labels)
    const prompt = test.votePrompt(c.version, c.voter, c.i, H.renderDossier(dossier, order), order)
    call(`vote:${c.cell}@${label}`, { step: 'vote', ...meta(c) }, prompt, c.voter.model, H.BALLOT_SCHEMA)
  }
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
```

- [ ] **Step 3: Make `runPersonaTest` a caller**

In `evals/persona.mjs`, replace the body of `runPersonaTest` (and the 2 local constants and now-unused imports) with:

```js
import { runVoterTest, MAX_FAILURE_STREAK } from './lib/voter-runner.mjs'
```

```js
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
```

Keep the CLI block unchanged; it still uses `MAX_FAILURE_STREAK`, which now comes from the import. Import `ballotMeasures` from `persona-core.mjs`.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all 199 pass, with no test edited. Also run `node evals/persona.mjs` with no arguments. Expected: the usage line and exit code 2.

- [ ] **Step 5: Commit**

```bash
git add evals/lib/voter-runner.mjs evals/lib/persona-core.mjs evals/persona.mjs
git commit -m "refactor(evals): share the voter-test runner

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Sheet voters and sheet variants

**Files:** Create `evals/sheet-voters-5lang.json`, `evals/lib/sheet-core.mjs`, and `tests/evals-sheets.test.mjs`.

- [ ] **Step 1: Create the voters file**

Generate it from `evals/persona-voters-5lang.json` with this one-off command, which adds the approved items 4 and 5:

```bash
node -e "
const src = require('./evals/persona-voters-5lang.json')
const extra = {
  'Everyday engineer user': ['works offline after install', 'consistent flags across commands'],
  'Platform team maintainer': ['easy local reproduction of user bugs', 'short CI time per change'],
  'Future new hire': ['a conventional project layout', 'good editor and IDE support'],
  'Release engineer': ['automatic update delivery to users', 'simple rollback of a bad release'],
  'Security engineer': ['safe handling of stored OAuth tokens', 'a small attack surface'],
  'Developer-experience support lead': ['detailed logs on request', 'users can check their own setup'],
  'Engineering manager (5-year owner)': ['no lock-in to one vendor\'s tooling', 'low training cost for new staff'],
}
const line = (c, k) => c.split('\n').find(l => l.startsWith(k)).replace(/^[^:]*:\s*/, '').trim()
const out = {
  seed: src.seed,
  note: 'Sheet-quality test voters: the 5-language follow-up voters with items 4 and 5 the user approved on 2026-11-12. cares is in rank order.',
  voters: src.voters.map(v => ({
    name: v.name, model: v.model,
    cares: [...line(v.criteria, 'Cares about').split(',').map(s => s.trim()), ...extra[v.name]],
    accepts: line(v.criteria, 'Accepts'), rejects: line(v.criteria, 'Rejects'),
  })),
}
require('fs').writeFileSync('evals/sheet-voters-5lang.json', JSON.stringify(out, null, 2) + '\n')
"
```

- [ ] **Step 2: Write the failing tests**

Create `tests/evals-sheets.test.mjs`:

```js
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
```

- [ ] **Step 3: Run them to see them fail**

Run: `node --test tests/evals-sheets.test.mjs`
Expected: FAIL, `Cannot find module '../evals/lib/sheet-core.mjs'`.

- [ ] **Step 4: Create `evals/lib/sheet-core.mjs`**

```js
import { fileURLToPath } from 'node:url'
import { H } from './helpers.mjs'

export const SHEETS_VOTERS_PATH = fileURLToPath(new URL('../sheet-voters-5lang.json', import.meta.url))
export const SHEET_VERSIONS = ['S0', 'S1', 'S2', 'S3', 'S4']

const cares = (items, ranked) => `Cares about (${ranked ? 'in order' : 'in no particular order'}): ${items.join(', ')}`
const limits = v => [`Accepts: ${v.accepts}`, `Rejects: ${v.rejects}`]

// S0 production; S1 unranked; S2 no Accepts or Rejects; S3 top 2 items; S4 all 5 items.
export function sheetText(version, voter, seed, index) {
  const c = voter.cares
  if (version === 'S0') return [cares(c.slice(0, 3), true), ...limits(voter)].join('\n')
  // A seeded shuffle, so the display order does not carry the rank.
  if (version === 'S1') return [cares(H.shuffle(c.slice(0, 3), H.makeRng(seed + 2000 + index)), false), ...limits(voter)].join('\n')
  if (version === 'S2') return cares(c.slice(0, 3), true)
  if (version === 'S3') return [cares(c.slice(0, 2), true), ...limits(voter)].join('\n')
  if (version === 'S4') return [cares(c, true), ...limits(voter)].join('\n')
  throw new Error(`unknown sheet version ${version}`)
}

// The judge's reference: all 5 ranked items with Accepts and Rejects.
export const referenceCriteria = voter => [cares(voter.cares, true), ...limits(voter)].join('\n')

// The reference lines each version's sheet shows, as judge labels.
export const OWN_LINES = {
  S0: new Set(['cares1', 'cares2', 'cares3', 'accepts', 'rejects']),
  S1: new Set(['cares1', 'cares2', 'cares3', 'accepts', 'rejects']),
  S2: new Set(['cares1', 'cares2', 'cares3']),
  S3: new Set(['cares1', 'cares2', 'accepts', 'rejects']),
  S4: new Set(['cares1', 'cares2', 'cares3', 'cares4', 'cares5', 'accepts', 'rejects']),
}

export function sheetIdentity(version, voter, seed, index) {
  return H.voterIdentity({ name: voter.name, criteria: sheetText(version, voter, seed, index) })
}
```

- [ ] **Step 5: Run the tests and commit**

Run: `npm test`
Expected: all pass (204).

```bash
git add evals/sheet-voters-5lang.json evals/lib/sheet-core.mjs tests/evals-sheets.test.mjs
git commit -m "feat(evals): sheet-test voters and sheet variants

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Measures, summary, differences, report text

**Files:** Modify `evals/lib/sheet-core.mjs` and `tests/evals-sheets.test.mjs` (append).

- [ ] **Step 1: Write the failing tests**

Append:

```js
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
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/evals-sheets.test.mjs`
Expected: FAIL (`sheetMeasures` is not exported).

- [ ] **Step 3: Implement**

Append to `evals/lib/sheet-core.mjs`:

```js
import { stability, firstChoiceStats, mean } from './persona-core.mjs'

// Adherence: reasons tied to the voter's own lines. Coverage: reasons tied to any reference line.
// Top-item weight: share of "Cares about" reasons that serve the voter's #1 item.
export function sheetMeasures(judgment, ballot, version) {
  const serves = new Map((judgment.reasons || []).map(r => [r.index, r.serves]))
  const got = ballot.reasons.map((_, i) => serves.get(i) || 'none')
  const n = got.length
  const caresTied = got.filter(l => /^cares\d$/.test(l))
  return {
    adherence: n ? got.filter(l => OWN_LINES[version].has(l)).length / n : 0,
    coverage: n ? got.filter(l => l !== 'none').length / n : 0,
    topWeight: caresTied.length ? caresTied.filter(l => l === 'cares1').length / caresTied.length : null,
    violations: (judgment.rejectsViolations || []).length,
  }
}

export function summarizeSheets(results, voters, versions = SHEET_VERSIONS) {
  const byVersion = {}
  const byVoter = []
  for (const version of versions) {
    const rs = results.filter(r => r.version === version)
    const valid = rs.filter(r => r.status === 'valid')
    const judged = valid.filter(r => r.measures)
    const pick = k => mean(judged.map(r => r.measures[k]).filter(x => x !== null))
    const cells = voters.map(voter => {
      const mine = valid.filter(r => r.voter === voter.name)
      const st = stability(mine.map(r => r.ranking))
      return { voter: voter.name, version, valid: mine.length, adherence: mean(mine.filter(r => r.measures).map(r => r.measures.adherence)), sameWinner: st.sameWinner, spread: st.spread }
    })
    byVoter.push(...cells)
    byVersion[version] = {
      valid: valid.length,
      invalid: rs.filter(r => r.status === 'invalid').length,
      missing: rs.filter(r => r.status === 'missing').length,
      adherence: pick('adherence'), coverage: pick('coverage'), topWeight: pick('topWeight'), violations: pick('violations'),
      sameWinner: mean(cells.filter(c => c.valid > 0).map(c => c.sameWinner)),
      spread: mean(cells.map(c => c.spread).filter(x => x !== null)),
      ...firstChoiceStats(valid.map(r => r.ranking)),
    }
  }
  return { byVersion, byVoter }
}

// Decision rule from the spec: the smallest gap from S0 that counts, per measure.
export const BARS = { adherence: 0.10, coverage: 0.10, topWeight: 0.10, topFirstShare: 0.15, violations: 0.5 }

export function differences(byVersion, base = 'S0') {
  const out = []
  for (const version of Object.keys(byVersion)) {
    if (version === base) continue
    for (const [measure, bar] of Object.entries(BARS)) {
      const a = byVersion[version][measure]
      const b = byVersion[base][measure]
      if (a == null || b == null) continue
      const gap = a - b
      // Rounded to 3 places, so a gap of exactly the bar counts.
      if (Math.round(Math.abs(gap) * 1000) >= Math.round(bar * 1000)) out.push({ version, measure, gap })
    }
  }
  return out
}

const f2 = x => (x == null ? 'n/a' : x.toFixed(2))
const signed = x => `${x >= 0 ? '+' : '-'}${Math.abs(x).toFixed(2)}`

export function formatSheetReport(summary, run, failed = []) {
  const { byVersion, byVoter } = summary
  const versions = Object.keys(byVersion)
  const diffs = differences(byVersion)
  const lines = [
    `# Sheet test ${run.runId}`,
    '',
    `Script ${run.scriptCommit}. Spend $${(run.spent ?? 0).toFixed(2)} of $${Number(run.budgetUsd).toFixed(2)}.`,
    'S0 production sheet. S1 unranked. S2 no Accepts or Rejects. S3 top 2 items. S4 all 5 items.',
    '',
    '| Version | Valid | Invalid | Missing | Adherence | Coverage | Top-item weight | Rejects violations | Same winner | Ranking spread | Top first-choice share |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...versions.map(k => {
      const x = byVersion[k]
      return `| ${k} | ${x.valid} | ${x.invalid} | ${x.missing} | ${f2(x.adherence)} | ${f2(x.coverage)} | ${f2(x.topWeight)} | ${f2(x.violations)} | ${f2(x.sameWinner)} | ${f2(x.spread)} | ${f2(x.topFirstShare)} |`
    }),
    '',
    `Differences from S0 that pass their bar (adherence, coverage, top-item weight ${BARS.adherence.toFixed(2)}; top first-choice share ${BARS.topFirstShare.toFixed(2)}; rejects violations ${BARS.violations.toFixed(2)}):`,
    ...(diffs.length ? diffs.map(d => `- ${d.version}: ${d.measure} ${signed(d.gap)}`) : ['- none']),
    '',
    'Each version has at most 21 ballots, so only large effects show.',
    '',
    '| Voter | Version | Valid | Adherence | Same winner | Ranking spread |',
    '| --- | --- | --- | --- | --- | --- |',
    ...byVoter.map(c => `| ${c.voter} | ${c.version} | ${c.valid} | ${f2(c.adherence)} | ${c.sameWinner} | ${f2(c.spread)} |`),
  ]
  if (failed.length) lines.push('', 'Failed calls:', ...failed.map(r => `- ${r.key}${r.subtype ? ` (${r.subtype})` : ''}: ${r.error}`))
  return lines.join('\n')
}
```

Move the new `import` line to the top of the file with the other imports.

- [ ] **Step 4: Run the tests and commit**

Run: `npm test`
Expected: all pass (208).

```bash
git add evals/lib/sheet-core.mjs tests/evals-sheets.test.mjs
git commit -m "feat(evals): sheet-test measures, differences, and report text

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The sheet-test runner and CLI

**Files:** Create `evals/sheets.mjs`; append to `tests/evals-sheets.test.mjs`.

- [ ] **Step 1: Write the failing tests**

Append:

```js
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
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/evals-sheets.test.mjs`
Expected: FAIL, `Cannot find module '../evals/sheets.mjs'`.

- [ ] **Step 3: Create `evals/sheets.mjs`**

```js
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
```

Note: `judgePrompt` reads only `voter.criteria`, so it gets the reference sheet and never the voter's name.

- [ ] **Step 4: Run the tests and check the CLI**

Run: `npm test` (expected: all pass, 210), then `node evals/sheets.mjs` (expected: the usage line, exit code 2). Do NOT run it with a run id.

- [ ] **Step 5: Commit**

```bash
git add evals/sheets.mjs tests/evals-sheets.test.mjs
git commit -m "feat(evals): sheet-test runner and CLI

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: README

- [ ] Add a `## Sheet-quality test` section to `evals/README.md` after the persona test section, and a row to the top table: `| Sheet-quality test | node evals/sheets.mjs --run-id <id> --budget-usd 15 | 105 voter calls and up to 105 judge calls |`. Cover:
  - the question
  - the 5 versions
  - that the judge always uses the 5-item reference sheet
  - the 4 measures, and stability and diversity
  - the decision rule
  - the default $15 cap
  - that `--repeats` exists

  Run `npm test`, then commit as `docs(evals): how to run the sheet-quality test`.

---

### Task 6: The pilot run (user checkpoint)

This task spends money and needs the user's go-ahead.

- [ ] **Step 1:** Ask the user to approve 105 voter calls and up to 105 judge calls, with a $15 cap.
- [ ] **Step 2:** Run `node evals/sheets.mjs --run-id 2026-11-12-sheets1 --budget-usd 15`.
- [ ] **Step 3:** Show the results one change at a time (S1, S2, S3, S4 against S0): a short table, then what was right, what was wrong, and what to improve.
- [ ] **Step 4:** Write `evals/FINDINGS-2026-11-12-sheets.md`, including a recommendation for the template in step 1 of the skill, and commit it.
