# Council Mode Sheet v2 Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the sheet v2 test. It measures whether 3 parts from published preference prompts make voters more faithful, steadier, or more diverse: item definitions, a priority instruction, and an assessment written before the ranking.

**Architecture:** The shared runner (`evals/lib/voter-runner.mjs`) gains one optional hook, `voteSchema(version)`, so V3 and V4 can ask for the extended ballot. `evals/lib/sheet2-core.mjs` holds the version texts, the extended schema, the judge prompt with definitions, the measures, the summary, and the report text. It reuses `sheetMeasures`, `summarizeSheets`, `differences`, and `BARS` from `sheet-core.mjs`. `evals/sheets2.mjs` is the CLI.

**Tech Stack:** Node 22 ESM, `node:test`, the Claude Code CLI through `evals/lib/claude.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-12-council-mode-sheet-v2-test-design.md`

---

## Facts every task relies on

- Repo `C:\Users\marko\source\repos\council-mode`, branch `feat/sheet-v2`. `npm test` passes (211 tests) before Task 1.
- `evals/lib/voter-runner.mjs` exports `runVoterTest({ runId, budgetUsd, repeats, root, runner, argv0, commit, voters, fixtureDir, test })`. Line 58 sends every voter call with `H.BALLOT_SCHEMA`.
- `evals/lib/persona-core.mjs` exports `loadVoters(path)` (adds `hash`), `parseCriteria`, `JUDGE_MODEL` ('opus'), `JUDGE_SCHEMA`, `mean`, and `evaluate`. `evaluate` calls `measure(judge.output, ballot, version)` with the ballot from `H.normalizeBallot`, which keeps unknown fields such as `assessment` through `...ballot`.
- `evals/lib/sheet-core.mjs` exports `sheetMeasures(judgment, ballot, version)`, `summarizeSheets(results, voters, versions)`, `differences(byVersion, base)`, and `BARS`. `OWN_LINES.S0` is `cares1`–`cares3`, `accepts`, `rejects`: the lines every v2 version shows. `differences` skips a measure whose value is `null` or `undefined`.
- `evals/sheets.mjs` exports `SHEETS_FIXTURE_DIR` (`evals/fixtures/2026-11-12-cli-5lang/`).
- `H` from `evals/lib/helpers.mjs` includes `voterIdentity`, `votePrompt(persona, dossierText, order, identity)`, `BALLOT_SCHEMA`, `normalizeBallot`, `validateBallot`, `dossierIds`, and `renderDossier`. `votePrompt` puts the ballot rules after the line `Ballot rules:`.
- `H` objects come from a `vm` context, so their arrays have another realm's prototype. In tests, compare them through `Object.keys(...)` or `JSON.stringify`, never `assert.deepEqual` on the object itself.
- `evals/persona-voters-5lang.json` holds the 7 production voters, seed 20261113. The v2 voters file keeps the same seed, so each voter gets the same option order as in the earlier tests.
- Commit messages end with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- All tests are offline: a fake runner and temp run folders, never the real CLI or `~/.claude`.

## Decision made in this plan

Assessment coverage is computed inside the measure function, so it counts judged ballots only. A ballot whose judge call fails has no measures. The report says "judged ballots".

## File structure

| Path | Responsibility |
| --- | --- |
| `evals/lib/voter-runner.mjs` | Modify: optional `test.voteSchema(version)` |
| `evals/sheet-voters-5lang-v2.json` | Create: 7 voters, 3 items each with serves and fails lines, Accepts, Rejects |
| `evals/lib/sheet2-core.mjs` | Create: version texts, extended schema, judge prompt, measures, summary, report |
| `evals/sheets2.mjs` | Create: `runSheet2Test` and the CLI |
| `tests/evals-sheets2.test.mjs` | Create: offline tests |
| `evals/README.md` | Modify: a sheet v2 section and a table row |

---

### Task 1: The `voteSchema` hook in the shared runner

**Files:**
- Modify: `evals/lib/voter-runner.mjs:12` and `:58`
- Test: `tests/evals-sheets2.test.mjs` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/evals-sheets2.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the test to see it fail**

Run: `node --test tests/evals-sheets2.test.mjs`
Expected: FAIL. `seen` is `['a| false', 'b| false']` in the first run, because the runner ignores `voteSchema`.

- [ ] **Step 3: Add the hook**

In `evals/lib/voter-runner.mjs`, change the comment on line 12:

```js
// test: { kind, versions, votePrompt(version, voter, index, dossierText, order), voteSchema?(version), judge: { model, schema, prompt(voter, ballot, options) }, measure(judgment, ballot, version) }
// voteSchema is optional; without it every voter call uses the production BALLOT_SCHEMA.
```

Change line 58:

```js
    call(`vote:${c.cell}@${label}`, { step: 'vote', ...meta(c) }, prompt, c.voter.model, test.voteSchema ? test.voteSchema(c.version) : H.BALLOT_SCHEMA)
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test tests/evals-sheets2.test.mjs tests/evals-sheets.test.mjs tests/evals-persona.test.mjs`
Expected: PASS, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add evals/lib/voter-runner.mjs tests/evals-sheets2.test.mjs
git commit -m "feat(evals): optional per-version ballot schema in the shared voter runner

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The v2 voters file

**Files:**
- Create: `evals/sheet-voters-5lang-v2.json`
- Test: `tests/evals-sheets2.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/evals-sheets2.test.mjs`:

```js
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
```

`loadVoters` takes a path; `readFileSync` accepts a `URL`, so both work.

- [ ] **Step 2: Run the test to see it fail**

Run: `node --test tests/evals-sheets2.test.mjs`
Expected: FAIL with `ENOENT` for `sheet-voters-5lang-v2.json`.

- [ ] **Step 3: Create the voters file**

Create `evals/sheet-voters-5lang-v2.json`. The serves and fails lines are word for word from the spec's Definitions table:

```json
{
  "seed": 20261113,
  "note": "The 7 voters of persona-voters-5lang.json with their 3 production items, Accepts, and Rejects. Each item has the serves and fails lines the user approved on 2026-11-12 (spec: docs/superpowers/specs/2026-11-12-council-mode-sheet-v2-test-design.md).",
  "voters": [
    {
      "name": "Everyday engineer user",
      "model": "haiku",
      "cares": [
        { "item": "fast start", "serves": "Common commands answer well under 300 ms on all 3 OSes.", "fails": "Start time is near or over the limit, or grows as the tool grows." },
        { "item": "easy install and update", "serves": "One command installs or updates it, with nothing to install first.", "fails": "The user must install or manage a runtime, package manager, or PATH setup." },
        { "item": "clear help and errors", "serves": "Every command has built-in help, and errors say what went wrong and what to do.", "fails": "Errors show raw stack traces or codes with no next step." }
      ],
      "accepts": "a larger download",
      "rejects": "a runtime they must manage themselves"
    },
    {
      "name": "Platform team maintainer",
      "model": "sonnet",
      "cares": [
        { "item": "speed of adding commands", "serves": "Most of the team can add a command in a day or two with existing patterns.", "fails": "A new command needs specialist knowledge or long build cycles." },
        { "item": "debugging and test tooling", "serves": "A mature debugger and test framework the team knows, with fast local test runs.", "fails": "Weak or unfamiliar debugging and testing tools." },
        { "item": "few dependencies", "serves": "The standard library covers most needs.", "fails": "Core features rely on many third-party packages." }
      ],
      "accepts": "some build complexity",
      "rejects": "a codebase only 1 team member can change"
    },
    {
      "name": "Future new hire",
      "model": "sonnet",
      "cares": [
        { "item": "readable code", "serves": "A newcomer can follow a command's logic without special training.", "fails": "Following the code needs advanced language or framework knowledge." },
        { "item": "size of the hiring pool", "serves": "Many developers on the job market already know the language.", "fails": "Few candidates know it, so new hires need long training." },
        { "item": "quality of docs and examples", "serves": "Plenty of current official docs and examples for CLI, HTTP, and OAuth work.", "fails": "Docs for these tasks are sparse or outdated." }
      ],
      "accepts": "a less fashionable stack",
      "rejects": "code that needs specialist knowledge to change"
    },
    {
      "name": "Release engineer",
      "model": "opus",
      "cares": [
        { "item": "reproducible builds for 3 OSes from one CI", "serves": "One CI pipeline builds all 3 OS binaries from the same source.", "fails": "A release needs a separate machine or manual steps per OS." },
        { "item": "code signing on macOS and Windows", "serves": "CI signs and notarizes the artifacts with standard tools.", "fails": "Signing needs manual steps, or the artifacts are hard to sign." },
        { "item": "small artifacts", "serves": "Each release download is a few megabytes.", "fails": "Each release ships a bundled runtime or a large download." }
      ],
      "accepts": "longer CI builds",
      "rejects": "per-OS build machines kept by hand"
    },
    {
      "name": "Security engineer",
      "model": "opus",
      "cares": [
        { "item": "supply-chain risk of dependencies", "serves": "Few dependencies, pinned versions, and a tool to audit them.", "fails": "A large or unpinned dependency tree that is hard to audit." },
        { "item": "memory safety", "serves": "The language prevents buffer overflows and use-after-free in normal code.", "fails": "Memory errors are possible in normal code." },
        { "item": "fast toolchain patches", "serves": "A toolchain security fix can be rebuilt and released within a week.", "fails": "Fixes wait on users updating a runtime themselves." }
      ],
      "accepts": "fewer features",
      "rejects": "unpinned or unaudited dependency trees"
    },
    {
      "name": "Developer-experience support lead",
      "model": "haiku",
      "cares": [
        { "item": "the same behavior on all 3 OSes", "serves": "One codebase behaves the same on all 3 OSes, with no OS branches in common commands.", "fails": "Paths, shells, or runtimes differ by OS and cause OS-specific bugs." },
        { "item": "actionable error messages", "serves": "Errors name the cause and the fix.", "fails": "Errors are generic or show internals." },
        { "item": "easy diagnostics from users", "serves": "One command collects version, environment, and logs for a ticket.", "fails": "Support must ask users to gather details by hand." }
      ],
      "accepts": "a slower feature pace",
      "rejects": "OS-specific bugs that need per-machine fixes"
    },
    {
      "name": "Engineering manager (5-year owner)",
      "model": "sonnet",
      "cares": [
        { "item": "total cost of ownership", "serves": "Low build, run, and maintenance cost over 5 years with the current team.", "fails": "Hidden costs such as retraining, special build infrastructure, or rewrites." },
        { "item": "staffing risk under turnover", "serves": "At least half the current team can maintain it, and replacements are easy to hire.", "fails": "It depends on 1 or 2 people or a rare skill." },
        { "item": "long-term toolchain support", "serves": "The toolchain has a published support policy that covers 5 years.", "fails": "The toolchain's 5-year support is uncertain." }
      ],
      "accepts": "a higher first build cost",
      "rejects": "a toolchain with uncertain 5-year support"
    }
  ]
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `node --test tests/evals-sheets2.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add evals/sheet-voters-5lang-v2.json tests/evals-sheets2.test.mjs
git commit -m "feat(evals): sheet v2 voters with approved item definitions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Version texts and the extended schema

**Files:**
- Create: `evals/lib/sheet2-core.mjs`
- Test: `tests/evals-sheets2.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `tests/evals-sheets2.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test tests/evals-sheets2.test.mjs`
Expected: FAIL with `Cannot find module` for `sheet2-core.mjs`.

- [ ] **Step 3: Write the module**

Create `evals/lib/sheet2-core.mjs`:

```js
import { fileURLToPath } from 'node:url'
import { H } from './helpers.mjs'

export const SHEETS2_VOTERS_PATH = fileURLToPath(new URL('../sheet-voters-5lang-v2.json', import.meta.url))
export const SHEET2_VERSIONS = ['V0', 'V1', 'V2', 'V3', 'V4']

// V0 production; V1 + definitions; V2 + priority instruction; V3 + assessment first; V4 all 3.
const DEFINED = new Set(['V1', 'V4'])
const PRIORITIZED = new Set(['V2', 'V4'])
export const ASSESSED = new Set(['V3', 'V4'])

export const PRIORITY_LINES = [
  'Weigh your items in order: item 1 counts more than item 2, and item 2 more than item 3.',
  'Give up what your Accepts line names before you give up any item.',
  'Rank an option that has what your Rejects line names below the options that do not.',
]

export const ASSESSMENT_RULE = '- assessment: write this first. For each option, one note on how it serves or fails your items, citing dossier IDs. Then rank.'
const RULES_HEAD = '\nBallot rules:\n'

export function sheet2Text(version, voter) {
  if (!SHEET2_VERSIONS.includes(version)) throw new Error(`unknown sheet v2 version ${version}`)
  const items = DEFINED.has(version)
    ? ['Cares about (in order):', ...voter.cares.flatMap((c, i) => [`${i + 1}. ${c.item}`, `   Serves it: ${c.serves}`, `   Fails it: ${c.fails}`])]
    : [`Cares about (in order): ${voter.cares.map(c => c.item).join(', ')}`]
  return [...items, `Accepts: ${voter.accepts}`, `Rejects: ${voter.rejects}`].join('\n')
}

export function sheet2Identity(version, voter) {
  const id = H.voterIdentity({ name: voter.name, criteria: sheet2Text(version, voter) })
  return PRIORITIZED.has(version) ? [id, ...PRIORITY_LINES].join('\n') : id
}

export function sheet2VotePrompt(version, voter, dossierText, order) {
  const prompt = H.votePrompt(voter, dossierText, order, sheet2Identity(version, voter))
  if (!ASSESSED.has(version)) return prompt
  // The last match, so dossier text can never move the rule.
  const at = prompt.lastIndexOf(RULES_HEAD)
  if (at < 0) throw new Error('vote prompt has no "Ballot rules:" line')
  const end = at + RULES_HEAD.length
  return `${prompt.slice(0, end)}${ASSESSMENT_RULE}\n${prompt.slice(end)}`
}

// The production ballot with an assessment listed first, so the model writes it before the ranking.
export const BALLOT2_SCHEMA = {
  type: 'object',
  properties: {
    assessment: {
      type: 'array',
      items: { type: 'object', properties: { option: { type: 'string' }, note: { type: 'string' } }, required: ['option', 'note'] },
    },
    ...H.BALLOT_SCHEMA.properties,
  },
  required: ['assessment', ...H.BALLOT_SCHEMA.required],
}

export const voteSchema2 = version => (ASSESSED.has(version) ? BALLOT2_SCHEMA : H.BALLOT_SCHEMA)
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test tests/evals-sheets2.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add evals/lib/sheet2-core.mjs tests/evals-sheets2.test.mjs
git commit -m "feat(evals): sheet v2 version texts and the assessment-first ballot schema

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The judge prompt with definitions

**Files:**
- Modify: `evals/lib/sheet2-core.mjs`
- Test: `tests/evals-sheets2.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/evals-sheets2.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the test to see it fail**

Run: `node --test tests/evals-sheets2.test.mjs`
Expected: FAIL with `does not provide an export named 'judge2Prompt'`.

- [ ] **Step 3: Add the judge prompt**

Append to `evals/lib/sheet2-core.mjs`:

```js
// The production judge prompt's frame and rules, with each item's serves and fails lines.
// Every version is judged against this one reference, and the judge never sees the version or the voter's name.
export function judge2Prompt(voter, ballot, options) {
  return [
    "You check whether a voter's ballot follows the voter's own criteria. Judge only the fit between the reasons and the criteria, not whether the ranking is right.",
    '',
    "The voter's criteria, most important first, each with what serves it and what fails it:",
    ...voter.cares.flatMap((c, i) => [`cares${i + 1}: ${c.item}`, `  serves it: ${c.serves}`, `  fails it: ${c.fails}`]),
    `accepts: ${voter.accepts}`,
    `rejects: ${voter.rejects}`,
    '',
    'The options:',
    ...options.map(o => `${o.label}: ${o.description}`),
    '',
    `The ballot's ranking, best first: ${ballot.ranking.join(', ')}`,
    "The ballot's reasons, one per adjacent pair:",
    ...ballot.reasons.map((r, i) => `${i}. ${r.higher} over ${r.lower}: ${r.reason}`),
    '',
    'Rules:',
    '- reasons: one entry per reason, by its number. serves: the one criterion the reason mainly argues from (cares1, cares2, …, accepts, or rejects), or none if it argues from something the criteria do not mention. note: a few words on why.',
    '- rejectsViolations: each adjacent pair where the higher option has what the rejects line rules out and the lower option does not. An empty list if there are none.',
  ].join('\n')
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `node --test tests/evals-sheets2.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add evals/lib/sheet2-core.mjs tests/evals-sheets2.test.mjs
git commit -m "feat(evals): sheet v2 judge prompt with item definitions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Measures, summary, and report

**Files:**
- Modify: `evals/lib/sheet2-core.mjs`
- Test: `tests/evals-sheets2.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `tests/evals-sheets2.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test tests/evals-sheets2.test.mjs`
Expected: FAIL with `does not provide an export named 'assessmentComplete'`.

- [ ] **Step 3: Add the measures, summary, and report**

In `evals/lib/sheet2-core.mjs`, change the imports at the top to:

```js
import { fileURLToPath } from 'node:url'
import { H } from './helpers.mjs'
import { mean } from './persona-core.mjs'
import { sheetMeasures, summarizeSheets, differences, BARS } from './sheet-core.mjs'
```

Append:

```js
const optionLabel = x => String(x ?? '').trim().replace(/^option\s+/i, '').trim().toUpperCase()

// Complete when every ranked option has a non-empty note.
export function assessmentComplete(ballot) {
  const noted = new Set((ballot.assessment || []).filter(a => String(a.note ?? '').trim()).map(a => optionLabel(a.option)))
  return ballot.ranking.every(l => noted.has(l))
}

// Every v2 version shows the S0 lines (3 items, Accepts, Rejects), so adherence equals coverage and only adherence is kept.
export function sheet2Measures(judgment, ballot, version) {
  const { adherence, topWeight, violations } = sheetMeasures(judgment, ballot, 'S0')
  return { adherence, topWeight, violations, assessed: ASSESSED.has(version) ? (assessmentComplete(ballot) ? 1 : 0) : null }
}

export function summarizeSheets2(results, voters, versions = SHEET2_VERSIONS) {
  const s = summarizeSheets(results, voters, versions)
  for (const version of versions) {
    const x = s.byVersion[version]
    delete x.coverage
    const judged = results.filter(r => r.version === version && r.status === 'valid' && r.measures)
    x.assessed = mean(judged.map(r => r.measures.assessed).filter(v => v !== null))
  }
  return s
}

const f2 = x => (x == null ? 'n/a' : x.toFixed(2))
const signed = x => `${x >= 0 ? '+' : '-'}${Math.abs(x).toFixed(2)}`

export function formatSheet2Report(summary, run, failed = []) {
  const { byVersion, byVoter } = summary
  const versions = Object.keys(byVersion)
  const diffs = differences(byVersion, 'V0')
  const lines = [
    `# Sheet v2 test ${run.runId}`,
    '',
    `Script ${run.scriptCommit}. Spend $${(run.spent ?? 0).toFixed(2)} of $${Number(run.budgetUsd).toFixed(2)}.`,
    'V0 production. V1 + item definitions. V2 + priority instruction. V3 + assessment first. V4 all 3.',
    '',
    '| Version | Valid | Invalid | Missing | Adherence | Top-item weight | Rejects violations | Same winner | Ranking spread | Top first-choice share | Assessment coverage |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...versions.map(k => {
      const x = byVersion[k]
      return `| ${k} | ${x.valid} | ${x.invalid} | ${x.missing} | ${f2(x.adherence)} | ${f2(x.topWeight)} | ${f2(x.violations)} | ${f2(x.sameWinner)} | ${f2(x.spread)} | ${f2(x.topFirstShare)} | ${f2(x.assessed)} |`
    }),
    '',
    `Differences from V0 that pass their bar (adherence and top-item weight ${BARS.adherence.toFixed(2)}; top first-choice share ${BARS.topFirstShare.toFixed(2)}; rejects violations and ranking spread ${BARS.violations.toFixed(2)}):`,
    ...(diffs.length ? diffs.map(d => `- ${d.version}: ${d.measure} ${signed(d.gap)}`) : ['- none']),
    '',
    'V4 against V0 is the headline result. V1, V2, and V3 show which part did the work.',
    'Assessment coverage: the share of judged V3 and V4 ballots with a note for every option.',
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

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test tests/evals-sheets2.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add evals/lib/sheet2-core.mjs tests/evals-sheets2.test.mjs
git commit -m "feat(evals): sheet v2 measures, assessment coverage, and report

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The CLI and the end-to-end test

**Files:**
- Create: `evals/sheets2.mjs`
- Test: `tests/evals-sheets2.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/evals-sheets2.test.mjs`:

```js
import { runSheet2Test } from '../evals/sheets2.mjs'

test('runSheet2Test runs 5 versions, asks V3 and V4 for an assessment, and judges against the definitions', () => {
  const calls = []
  const runner = (cmd, args, opts) => {
    calls.push({ input: opts.input, schema: JSON.parse(args[args.indexOf('--json-schema') + 1]) })
    return fakeModel(cmd, args, opts)
  }
  const res = runSheet2Test({ ...base, runId: 'e1', repeats: 1, root: tmpRoot(), runner })
  assert.equal(calls.length, 7 * 5 * 2)
  const votes = calls.filter(c => c.input.startsWith('You are a voter'))
  const assessed = votes.filter(c => c.input.includes(ASSESSMENT_RULE))
  assert.equal(assessed.length, 14)
  assert.ok(assessed.every(c => 'assessment' in c.schema.properties))
  assert.ok(votes.filter(c => !c.input.includes(ASSESSMENT_RULE)).every(c => !('assessment' in c.schema.properties)))
  assert.equal(votes.filter(c => c.input.includes('Serves it: ')).length, 14)
  assert.equal(votes.filter(c => c.input.includes(PRIORITY_LINES[0])).length, 14)
  const judges = calls.filter(c => c.input.startsWith("You check whether a voter's ballot"))
  assert.equal(judges.length, 35)
  assert.ok(judges.every(c => c.input.includes('  serves it: ') && !/\bV[0-4]\b/.test(c.input)))
  assert.equal(res.summary.byVersion.V0.adherence, 1)
  assert.equal(res.summary.byVersion.V0.assessed, null)
  assert.equal(res.summary.byVersion.V3.assessed, 1)
  assert.equal('coverage' in res.summary.byVersion.V4, false)
  assert.equal(res.stoppedBy, null)
})
```

- [ ] **Step 2: Run the test to see it fail**

Run: `node --test tests/evals-sheets2.test.mjs`
Expected: FAIL with `Cannot find module` for `sheets2.mjs`.

- [ ] **Step 3: Write the CLI**

Create `evals/sheets2.mjs`:

```js
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
```

- [ ] **Step 4: Run the test to see it pass**

Run: `node --test tests/evals-sheets2.test.mjs`
Expected: PASS.

- [ ] **Step 5: Check the CLI rejects bad arguments without any model call**

Run: `node evals/sheets2.mjs --repeats 0`
Expected: the usage line on stderr, exit code 2.

- [ ] **Step 6: Commit**

```bash
git add evals/sheets2.mjs tests/evals-sheets2.test.mjs
git commit -m "feat(evals): sheet v2 test CLI

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: README and the full suite

**Files:**
- Modify: `evals/README.md:10` and before `## The findings loop`

- [ ] **Step 1: Add the table row**

After line 10 of `evals/README.md` (the sheet-quality row), add:

```markdown
| Sheet v2 test | `node evals/sheets2.mjs --run-id <id> --budget-usd 15` | 105 voter calls and up to 105 judge calls |
```

- [ ] **Step 2: Add the section**

Insert before `## The findings loop`:

````markdown
## Sheet v2 test

The sheet v2 test checks 3 parts that published preference prompts have and the production voter prompt lacks. Design: `docs/superpowers/specs/2026-11-12-council-mode-sheet-v2-test-design.md`. Background: `docs/research/prompt-structures.md`.

| Version | Change from production |
| --- | --- |
| V0 | None |
| V1 | A "Serves it" and a "Fails it" line under each "Cares about" item |
| V2 | 3 priority-instruction lines after the sheet |
| V3 | An `assessment` field before `ranking` in the ballot, and a ballot rule to write it first |
| V4 | V1 + V2 + V3 |

Run it:

```bash
node evals/sheets2.mjs --run-id 2026-11-12-sheets2-1 --budget-usd 15
```

The options are the same as the sheet-quality test: `--budget-usd` (default 15) and `--repeats` (default 3).

The voters are in `sheet-voters-5lang-v2.json`: the 7 production voters of the 5-language follow-up, with the approved definitions for each item. The dossier comes from `fixtures/2026-11-12-cli-5lang/`.

The judge scores every version against one reference: the 3 items with their definitions, Accepts, and Rejects. Every version shows all of those lines, so adherence equals coverage, and the report shows adherence only. The report also gives assessment coverage: the share of judged V3 and V4 ballots with a note for every option.

The decision rule compares each version with V0, with the sheet-quality test's bars: 0.10 for adherence or top-item weight, 0.15 for the top first-choice share, 0.5 for mean rejects violations, and 0.5 for ranking spread. V4 against V0 is the headline. Each version has at most 21 ballots, so only large effects show.
````

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS. 211 earlier tests plus the new ones in `tests/evals-sheets2.test.mjs`, 0 failures.

- [ ] **Step 4: Commit**

```bash
git add evals/README.md
git commit -m "docs(evals): sheet v2 test section

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the plan: the paid run

Ask the user before the run. It makes 105 voter calls and up to 105 judge calls, estimated at $9–11, with a $15 cap:

```bash
node evals/sheets2.mjs --run-id 2026-11-12-sheets2-1 --budget-usd 15
```

Then show the results one test at a time, write `evals/FINDINGS-2026-11-12-sheet-v2.md`, and add entries E10 and onward to `docs/research/evidence-log.md`.
