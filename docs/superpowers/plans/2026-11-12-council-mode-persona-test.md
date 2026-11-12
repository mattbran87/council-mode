# Council Mode Persona Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and run the persona test: does the voter's identity block (described persona, name plus criteria, criteria only) change how faithfully and how stably a voter ranks the same dossier?

**Architecture:** A voter stage in the existing eval harness. `evals/lib/persona-core.mjs` holds pure code (identity blocks, judge prompt and schema, measures, report text). `evals/persona.mjs` runs the calls through the existing `claude -p` caller and run store. One small production change splits the identity block out of `votePrompt`.

**Tech Stack:** Node 22 ESM, `node:test`, the Claude Code CLI (`claude -p --safe-mode --json-schema …`).

**Spec:** `docs/superpowers/specs/2026-11-12-council-mode-persona-test-design.md`

---

## Facts every task relies on

- Repo `C:\Users\marko\source\repos\council-mode`, branch `feat/persona-test`. `npm test` runs `node --test` and passes (179 tests) before Task 1.
- The workflow script is `plugins/council-mode/skills/council/council.workflow.js`. Its helpers section (between `// --- pure helpers start` and `// --- pure helpers end`) holds `makeRng(seed)`, `shuffle(items, rng)`, `normalizeBallot(ballot, labels, ids)`, `validateBallot(ballot, labels, ids)` → `{ valid, problems }`, `dossierIds(dossier)` → `Set`, `renderDossier(dossier, order)`, `BALLOT_SCHEMA`, and `votePrompt(persona, dossierText, order)`.
- Production voters use `shuffle(labels, makeRng(seed + 1000 + i))` for voter `i`'s option order.
- `BALLOT_SCHEMA` ballots: `{ ranking: [label], reasons: [{ higher, lower, reason, cites: [id] }], flipCondition, unacceptable: [label], hybrid }`.
- `evals/lib/helpers.mjs` exports `H = loadHelpers(...)` from `tests/harness.mjs`.
- `evals/lib/claude.mjs` exports `runClaude({ prompt, model, schema, budgetUsd, runner, argv0 })` → `{ ok, output, cost, durationMs }` or `{ ok: false, error, subtype?, cost?, durationMs }`, plus `claudeArgv`, `buildArgs`, `parseOutput`, `PER_CALL_CAP_USD` (0.5). `buildArgs` always adds `--safe-mode` and the web tools today.
- `evals/lib/runstore.mjs` exports `openRun(runId, root)` → `{ dir, append(row), spent(), latest(), writeRunInfo(info), readRunInfo() }` and `RUNS_ROOT`.
- `evals/probe.mjs` exports `scriptCommit()` (short commit of the workflow script, plus a content hash when it has uncommitted edits). Importing it does not run its CLI.
- `evals/lib/fixture.mjs` exports `loadFixture(dir)` → `{ dir, meta, top, run, journal }`. The first fixture's `run.options` items are `{ label, description, baseline }` (7 options); `run.dossier` is the saved dossier.
- `evals/persona-voters.json` is already committed with the plan: `{ seed: 20261112, note, voters: [{ name, model, criteria, description }] }`, 7 voters. Each `criteria` has 3 lines: `Cares about (in order): a, b, c`, `Accepts: …`, `Rejects: …`.
- Commit messages end with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- All tests are offline: a fake runner, temp run folders under `os.tmpdir()`, never the real CLI or `~/.claude`.

## File structure

| Path | Responsibility |
| --- | --- |
| `evals/lib/claude.mjs` | Modify: optional `tools` list |
| `plugins/council-mode/skills/council/council.workflow.js` | Modify: `voterIdentity`, `votePrompt` identity parameter |
| `evals/lib/helpers.mjs` | Modify: load the vote helpers too |
| `evals/lib/persona-core.mjs` | Create: voters, identity blocks, judge, measures, summary, verdicts, report text |
| `evals/persona.mjs` | Create: `runPersonaTest` and the CLI |
| `tests/evals-persona.test.mjs` | Create: offline tests |
| `evals/README.md` | Modify: a persona test section |

---

### Task 1: Let a call run with no tools

**Files:**
- Modify: `evals/lib/claude.mjs`
- Test: `tests/evals-probe.test.mjs` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/evals-probe.test.mjs`:

```js
test('buildArgs can turn every tool off', async () => {
  const { buildArgs } = await import('../evals/lib/claude.mjs')
  const none = buildArgs({ model: 'opus', schema: { type: 'object' }, budgetUsd: 0.5, tools: [] })
  assert.equal(none[none.indexOf('--tools') + 1], '')
  assert.ok(!none.includes('--allowedTools'))
  assert.ok(none.includes('--safe-mode'))
  const web = buildArgs({ model: 'opus', schema: { type: 'object' }, budgetUsd: 0.5 })
  assert.equal(web[web.indexOf('--tools') + 1], 'WebSearch,WebFetch')
  assert.equal(web[web.indexOf('--allowedTools') + 1], 'WebSearch,WebFetch')
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/evals-probe.test.mjs`
Expected: FAIL on `none[none.indexOf('--tools') + 1]` (it is `WebSearch,WebFetch`).

- [ ] **Step 3: Implement**

In `evals/lib/claude.mjs`, replace `buildArgs` and pass `tools` through `runClaude`:

```js
export const WEB_TOOLS = ['WebSearch', 'WebFetch']

export function buildArgs({ model, schema, budgetUsd, tools = WEB_TOOLS }) {
  const args = [
    '-p', '--output-format', 'json',
    '--model', model,
    '--max-budget-usd', budgetUsd.toFixed(4),
    '--json-schema', JSON.stringify(schema),
    // --safe-mode: no plugins, hooks, MCP servers, CLAUDE.md, or output styles, so the user's setup cannot change a call.
    '--safe-mode',
    // --tools: the only tools the model can see; an empty string turns every tool off.
    '--tools', tools.join(','),
  ]
  // --allowedTools: in -p mode --tools alone does not grant permission, so the calls would be denied.
  if (tools.length) args.push('--allowedTools', tools.join(','))
  return args
}
```

In `runClaude`, add `tools` to the parameters and to the `buildArgs` call:

```js
export function runClaude({ prompt, model, schema, budgetUsd, tools, runner = spawnSync, argv0 = claudeArgv() }) {
```

```js
  const res = runner(argv0[0], [...argv0.slice(1), ...buildArgs({ model, schema, budgetUsd, tools })], {
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all pass (180).

- [ ] **Step 5: Smoke-check that structured output still works with no tools**

`--json-schema` may rely on an internal tool. Run one real call (about 1 cent) from a temp directory:

```bash
cd "$TEMP" && echo 'Return ok true.' | claude -p --output-format json --model haiku --max-budget-usd 0.05 --safe-mode --tools "" --json-schema '{"type":"object","properties":{"ok":{"type":"boolean"}},"required":["ok"]}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log({is_error:j.is_error,subtype:j.subtype,structured_output:j.structured_output,cost:j.total_cost_usd})})"
```

Expected: `is_error: false` and `structured_output: { ok: true }`. If `structured_output` is missing or the call errors, stop and report BLOCKED with the output; do not change the design.

- [ ] **Step 6: Commit**

```bash
git add evals/lib/claude.mjs tests/evals-probe.test.mjs
git commit -m "feat(evals): let a claude call run with every tool off

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Split the identity block out of votePrompt

**Files:**
- Modify: `plugins/council-mode/skills/council/council.workflow.js` (`votePrompt`, in the helpers section)
- Modify: `evals/lib/helpers.mjs`
- Test: `tests/prompts.test.mjs` (append)

- [ ] **Step 1: Write the pinning test**

This test pins today's output byte for byte. It must pass before and after the change. Append to `tests/prompts.test.mjs` (it already imports `test` and `assert` and loads helpers with `loadHelpers`; load the 2 names it needs locally):

```js
test('votePrompt output is unchanged for a persona with name and criteria', async () => {
  const { loadHelpers } = await import('./harness.mjs')
  const { votePrompt } = loadHelpers('votePrompt')
  const p = { name: 'Maintainer', criteria: 'Cares about (in order): readability, tests\nAccepts: slower runtime\nRejects: specialists' }
  const expected = "You are a voter on a decision panel. Your persona: Maintainer.\nYour criteria sheet:\nCares about (in order): readability, tests\nAccepts: slower runtime\nRejects: specialists\n\nRank every option by your criteria, using only the dossier below. The debate authors are hidden.\n\nDOSSIER\n\nBallot rules:\n- ranking: every option label, best first. Labels: M, K.\n- reasons: one entry for each adjacent pair in your ranking (higher over lower). cites: the dossier IDs the reason rests on, such as claim IDs (K-C1), weakness IDs (K-W1), rulings (R1), concessions (X1), or unanswered challenges (U1). A reason that cites no dossier ID voids your ballot.\n- flipCondition: \"my ranking changes if ...\".\n- unacceptable: labels of options you would reject outright, or an empty list.\n- hybrid: a combination of options you would prefer, or an empty string."
  assert.equal(votePrompt(p, 'DOSSIER', ['M', 'K']), expected)
})

test('votePrompt takes a replacement identity block', async () => {
  const { loadHelpers } = await import('./harness.mjs')
  const { votePrompt, voterIdentity } = loadHelpers('votePrompt', 'voterIdentity')
  const p = { name: 'Maintainer', criteria: 'Cares about (in order): readability' }
  assert.equal(voterIdentity(p), 'You are a voter on a decision panel. Your persona: Maintainer.\nYour criteria sheet:\nCares about (in order): readability')
  const out = votePrompt(p, 'DOSSIER', ['M', 'K'], 'IDENTITY')
  assert.ok(out.startsWith('IDENTITY\n\nRank every option'))
  assert.ok(!out.includes('Maintainer'))
})
```

- [ ] **Step 2: Run them**

Run: `node --test tests/prompts.test.mjs`
Expected: the first test PASSES (it pins today's text); the second FAILS (`voterIdentity` is not defined).

- [ ] **Step 3: Implement**

In `council.workflow.js`, replace the first 3 lines of `votePrompt` with a call to a new helper. The result for today's callers is the same text.

```js
// The voter's identity: the persona name and criteria sheet. The eval swaps this block to test other identities.
function voterIdentity(persona) {
  return [
    `You are a voter on a decision panel. Your persona: ${persona.name}.`,
    'Your criteria sheet:',
    persona.criteria,
  ].join('\n')
}

function votePrompt(persona, dossierText, order, identity = voterIdentity(persona)) {
  return [
    identity,
    '',
    'Rank every option by your criteria, using only the dossier below. The debate authors are hidden.',
```

Keep every later line of `votePrompt` as it is.

In `evals/lib/helpers.mjs`, extend the list:

```js
export const H = loadHelpers(
  'validateBallot', 'dossierIds', 'tally', 'flipStats', 'renderDossier',
  'rulingPrompt', 'replyPrompt', 'numberCase', 'REPLY_SCHEMA', 'RULING_SCHEMA',
  'votePrompt', 'voterIdentity', 'BALLOT_SCHEMA', 'normalizeBallot', 'makeRng', 'shuffle',
)
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all pass (182). The workflow test that runs the whole script must still pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/council-mode/skills/council/council.workflow.js evals/lib/helpers.mjs tests/prompts.test.mjs
git commit -m "refactor: split the voter identity block out of votePrompt

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Voters, identity blocks, and orders

**Files:**
- Create: `evals/lib/persona-core.mjs`
- Test: `tests/evals-persona.test.mjs` (create)

- [ ] **Step 1: Write the failing tests**

Create `tests/evals-persona.test.mjs`:

```js
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
```

- [ ] **Step 2: Run them**

Run: `node --test tests/evals-persona.test.mjs`
Expected: FAIL with `Cannot find module '../evals/lib/persona-core.mjs'`.

- [ ] **Step 3: Implement**

Create `evals/lib/persona-core.mjs`:

```js
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { H } from './helpers.mjs'

export const VOTERS_PATH = fileURLToPath(new URL('../persona-voters.json', import.meta.url))
export const VERSIONS = ['v1', 'v2', 'v3']

// The hash goes into row keys, so an edit to a description or criteria sheet reruns the voters.
export function loadVoters(path = VOTERS_PATH) {
  const text = readFileSync(path, 'utf8')
  return { ...JSON.parse(text), hash: createHash('sha256').update(text).digest('hex').slice(0, 8) }
}

// "Cares about (in order): a, b, c" / "Accepts: …" / "Rejects: …"
export function parseCriteria(criteria) {
  const line = key => (criteria.split(/\r?\n/).find(l => l.trim().toLowerCase().startsWith(key)) || '').replace(/^[^:]*:\s*/, '').trim()
  return {
    cares: line('cares about').split(',').map(s => s.trim()).filter(Boolean),
    accepts: line('accepts'),
    rejects: line('rejects'),
  }
}

// v1: described persona; v2: today's production block; v3: criteria with no name.
export function identityFor(version, voter) {
  if (version === 'v1') return [`You are a voter on a decision panel. Your persona: ${voter.name}.`, 'About you:', voter.description].join('\n')
  if (version === 'v2') return H.voterIdentity(voter)
  if (version === 'v3') return ['You are a voter on a decision panel.', 'Your criteria sheet:', voter.criteria].join('\n')
  throw new Error(`unknown version ${version}`)
}

export function votePromptFor(version, voter, dossierText, order) {
  return H.votePrompt(voter, dossierText, order, identityFor(version, voter))
}

// The same seed offset the workflow uses for voter i.
export function orderFor(seed, index, labels) {
  return H.shuffle(labels, H.makeRng(seed + 1000 + index))
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all pass (187).

- [ ] **Step 5: Commit**

```bash
git add evals/lib/persona-core.mjs tests/evals-persona.test.mjs evals/persona-voters.json
git commit -m "feat(evals): persona test voters, identity blocks, and voter orders

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Judge, measures, summary, verdicts, report text

**Files:**
- Modify: `evals/lib/persona-core.mjs` (append)
- Test: `tests/evals-persona.test.mjs` (append)

- [ ] **Step 1: Write the failing tests**

Append to `tests/evals-persona.test.mjs`:

```js
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
  assert.deepEqual(verdicts(by), ['v3 beats v1'])
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
```

- [ ] **Step 2: Run them**

Run: `node --test tests/evals-persona.test.mjs`
Expected: FAIL (`judgePrompt` is not exported).

- [ ] **Step 3: Implement**

Append to `evals/lib/persona-core.mjs`:

```js
export const JUDGE_MODEL = 'opus'
export const MIN_GAIN = 0.10

export const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    reasons: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          serves: { type: 'string', enum: ['cares1', 'cares2', 'cares3', 'cares4', 'cares5', 'accepts', 'rejects', 'none'] },
          note: { type: 'string' },
        },
        required: ['index', 'serves', 'note'],
      },
    },
    rejectsViolations: {
      type: 'array',
      items: {
        type: 'object',
        properties: { higher: { type: 'string' }, lower: { type: 'string' }, note: { type: 'string' } },
        required: ['higher', 'lower', 'note'],
      },
    },
  },
  required: ['reasons', 'rejectsViolations'],
}

// The judge sees the criteria and the ballot only: no voter name and no version, so it cannot favor one.
export function judgePrompt(voter, ballot, options) {
  const c = parseCriteria(voter.criteria)
  return [
    "You check whether a voter's ballot follows the voter's own criteria. Judge only the fit between the reasons and the criteria, not whether the ranking is right.",
    '',
    "The voter's criteria, most important first:",
    ...c.cares.map((x, i) => `cares${i + 1}: ${x}`),
    `accepts: ${c.accepts}`,
    `rejects: ${c.rejects}`,
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

export function ballotMeasures(judgment, ballot) {
  const serves = new Map((judgment.reasons || []).map(r => [r.index, r.serves]))
  const n = ballot.reasons.length
  const tied = ballot.reasons.filter((_, i) => (serves.get(i) || 'none') !== 'none').length
  return {
    tiedShare: n ? tied / n : 0,
    topUsed: ballot.reasons.some((_, i) => serves.get(i) === 'cares1'),
    violations: (judgment.rejectsViolations || []).length,
  }
}

// Kendall distance: option pairs that the 2 rankings put in a different order.
export function kendall(a, b) {
  const pos = new Map(b.map((x, i) => [x, i]))
  const items = a.filter(x => pos.has(x))
  let d = 0
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) if (pos.get(items[i]) > pos.get(items[j])) d++
  }
  return d
}

export function stability(rankings) {
  if (!rankings.length) return { sameWinner: 0, spread: null }
  const counts = new Map()
  for (const r of rankings) counts.set(r[0], (counts.get(r[0]) || 0) + 1)
  const pairs = []
  for (let i = 0; i < rankings.length; i++) {
    for (let j = i + 1; j < rankings.length; j++) pairs.push(kendall(rankings[i], rankings[j]))
  }
  return { sameWinner: Math.max(...counts.values()), spread: pairs.length ? pairs.reduce((s, x) => s + x, 0) / pairs.length : null }
}

const mean = xs => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)

// results: [{ voter, version, attempt, status: 'valid'|'invalid'|'missing', ranking?, measures? }]
// A valid ballot with no measures (its judge call failed) counts for stability, not faithfulness.
export function summarize(results, voters, versions = VERSIONS) {
  const byVersion = {}
  const byVoter = []
  for (const version of versions) {
    const rs = results.filter(r => r.version === version)
    const judged = rs.filter(r => r.measures)
    const cells = voters.map(voter => {
      const mine = rs.filter(r => r.voter === voter.name)
      const st = stability(mine.filter(r => r.status === 'valid').map(r => r.ranking))
      return {
        voter: voter.name, version,
        valid: mine.filter(r => r.status === 'valid').length,
        tiedShare: mean(mine.filter(r => r.measures).map(r => r.measures.tiedShare)),
        sameWinner: st.sameWinner, spread: st.spread,
      }
    })
    byVoter.push(...cells)
    byVersion[version] = {
      valid: rs.filter(r => r.status === 'valid').length,
      invalid: rs.filter(r => r.status === 'invalid').length,
      missing: rs.filter(r => r.status === 'missing').length,
      tiedShare: mean(judged.map(r => r.measures.tiedShare)),
      topUsed: mean(judged.map(r => (r.measures.topUsed ? 1 : 0))),
      violations: mean(judged.map(r => r.measures.violations)),
      sameWinner: mean(cells.filter(c => c.valid > 0).map(c => c.sameWinner)),
      spread: mean(cells.map(c => c.spread).filter(x => x !== null)),
    }
  }
  return { byVersion, byVoter }
}

// Decision rule from the spec: A beats B when A's tied share is at least MIN_GAIN higher and A's spread is not higher.
export function verdicts(byVersion, versions = VERSIONS) {
  const out = []
  for (const a of versions) {
    for (const b of versions) {
      const A = byVersion[a]
      const B = byVersion[b]
      if (a === b || A.tiedShare == null || B.tiedShare == null) continue
      const gain = Math.round((A.tiedShare - B.tiedShare) * 1000) >= MIN_GAIN * 1000
      const steady = A.spread == null || B.spread == null || A.spread <= B.spread
      if (gain && steady) out.push(`${a} beats ${b}`)
    }
  }
  return out
}

const f2 = x => (x == null ? 'n/a' : x.toFixed(2))

export function formatPersonaReport(summary, run, failed = []) {
  const { byVersion, byVoter } = summary
  const versions = Object.keys(byVersion)
  const v = verdicts(byVersion, versions)
  const lines = [
    `# Persona test ${run.runId}`,
    '',
    `Script ${run.scriptCommit}. Spend $${(run.spent ?? 0).toFixed(2)} of $${Number(run.budgetUsd).toFixed(2)}.`,
    'v1: name + description. v2: name + criteria (production). v3: criteria only.',
    '',
    '| Version | Valid | Invalid | Missing | Tied share | Top criterion used | Rejects violations | Same winner | Ranking spread |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...versions.map(k => {
      const x = byVersion[k]
      return `| ${k} | ${x.valid} | ${x.invalid} | ${x.missing} | ${f2(x.tiedShare)} | ${f2(x.topUsed)} | ${f2(x.violations)} | ${f2(x.sameWinner)} | ${f2(x.spread)} |`
    }),
    '',
    `Verdicts (tied share at least ${MIN_GAIN.toFixed(2)} higher and spread not higher): ${v.length ? v.join('; ') : 'none'}.`,
    'Each version has at most 21 ballots, so only large differences show.',
    '',
    '| Voter | Version | Valid | Tied share | Same winner | Ranking spread |',
    '| --- | --- | --- | --- | --- | --- |',
    ...byVoter.map(c => `| ${c.voter} | ${c.version} | ${c.valid} | ${f2(c.tiedShare)} | ${c.sameWinner} | ${f2(c.spread)} |`),
  ]
  if (failed.length) lines.push('', 'Failed calls:', ...failed.map(r => `- ${r.key}${r.subtype ? ` (${r.subtype})` : ''}: ${r.error}`))
  return lines.join('\n')
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all pass (193).

- [ ] **Step 5: Commit**

```bash
git add evals/lib/persona-core.mjs tests/evals-persona.test.mjs
git commit -m "feat(evals): persona test judge, measures, verdicts, and report text

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The runner and CLI

**Files:**
- Modify: `evals/lib/persona-core.mjs` (append `evaluate`)
- Create: `evals/persona.mjs`
- Test: `tests/evals-persona.test.mjs` (append)

- [ ] **Step 1: Write the failing tests**

Append to `tests/evals-persona.test.mjs`:

```js
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
```

- [ ] **Step 2: Run them**

Run: `node --test tests/evals-persona.test.mjs`
Expected: FAIL with `Cannot find module '../evals/persona.mjs'`.

- [ ] **Step 3: Implement `evaluate`**

Append to `evals/lib/persona-core.mjs`:

```js
// Turns the run's rows into one result per planned ballot: valid (with measures when judged), invalid, or missing.
export function evaluate(rows, voters, versions, repeats, labels, ids) {
  const byKey = new Map(rows.filter(r => r.status === 'ok').map(r => [r.key, r]))
  const out = []
  voters.forEach((voter, i) => {
    for (const version of versions) {
      for (let attempt = 1; attempt <= repeats; attempt++) {
        const id = `${i}:${version}#${attempt}`
        const vote = [...byKey.values()].find(r => r.step === 'vote' && r.cell === id)
        if (!vote) { out.push({ voter: voter.name, version, attempt, status: 'missing' }); continue }
        const ballot = H.normalizeBallot(vote.output, labels, ids)
        if (!H.validateBallot(ballot, labels, ids).valid) { out.push({ voter: voter.name, version, attempt, status: 'invalid' }); continue }
        const judge = [...byKey.values()].find(r => r.step === 'judge' && r.cell === id)
        out.push({
          voter: voter.name, version, attempt, status: 'valid', ranking: ballot.ranking,
          measures: judge ? ballotMeasures(judge.output, ballot) : null,
        })
      }
    }
  })
  return out
}
```

- [ ] **Step 4: Implement `evals/persona.mjs`**

```js
#!/usr/bin/env node
// Persona test: node evals/persona.mjs --run-id <id> [--budget-usd 10] [--repeats 3]
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { H } from './lib/helpers.mjs'
import { loadFixture } from './lib/fixture.mjs'
import { runClaude, claudeArgv, PER_CALL_CAP_USD } from './lib/claude.mjs'
import { openRun, RUNS_ROOT } from './lib/runstore.mjs'
import { scriptCommit } from './probe.mjs'
import {
  loadVoters, VERSIONS, JUDGE_MODEL, JUDGE_SCHEMA, votePromptFor, orderFor, judgePrompt,
  evaluate, summarize, formatPersonaReport,
} from './lib/persona-core.mjs'

export const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/2026-11-11-cli-language', import.meta.url))
const MIN_CALL_USD = 0.01
const MAX_FAILURE_STREAK = 3

export function runPersonaTest({
  runId, budgetUsd = 10, repeats = 3, root = RUNS_ROOT, runner, argv0 = claudeArgv(),
  scriptCommit: commit = scriptCommit(), voters = loadVoters(), fixtureDir = FIXTURE_DIR,
}) {
  const fx = loadFixture(fixtureDir)
  const { dossier, options } = fx.run
  const labels = options.map(o => o.label)
  const ids = H.dossierIds(dossier)
  // The label changes when the vote prompt or the voters file changes, so either edit reruns the calls.
  const label = `${commit}/${voters.hash}`
  const run = openRun(runId, root)
  const info = run.readRunInfo() || { runId, kind: 'persona', started: new Date().toISOString() }
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

  const cells = voters.voters.flatMap((voter, i) => VERSIONS.flatMap(version =>
    Array.from({ length: repeats }, (_, k) => ({ voter, i, version, attempt: k + 1, cell: `${i}:${version}#${k + 1}` }))))

  // Voter calls first.
  for (const c of cells) {
    const order = orderFor(voters.seed, c.i, labels)
    const prompt = votePromptFor(c.version, c.voter, H.renderDossier(dossier, order), order)
    call(`vote:${c.cell}@${label}`, { step: 'vote', cell: c.cell, voter: c.voter.name, version: c.version, attempt: c.attempt }, prompt, c.voter.model, H.BALLOT_SCHEMA)
  }
  // Then one judge call per valid ballot.
  const latest = () => run.latest().filter(r => r.scriptCommit === label)
  for (const c of cells) {
    const vote = latest().find(r => r.step === 'vote' && r.cell === c.cell && r.status === 'ok')
    if (!vote) continue
    const ballot = H.normalizeBallot(vote.output, labels, ids)
    if (!H.validateBallot(ballot, labels, ids).valid) continue
    call(`judge:${c.cell}@${label}`, { step: 'judge', cell: c.cell, voter: c.voter.name, version: c.version, attempt: c.attempt }, judgePrompt(c.voter, ballot, options), JUDGE_MODEL, JUDGE_SCHEMA)
  }

  const rows = latest()
  const results = evaluate(rows, voters.voters, VERSIONS, repeats, labels, ids)
  const summary = summarize(results, voters.voters)
  const runInfo = { ...info, runId, scriptCommit: label, budgetUsd, repeats, spent: run.spent() }
  return { rows, results, summary, stoppedBy, lastError, run: runInfo, dir: run.dir }
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const usage = 'usage: node evals/persona.mjs --run-id <id> [--budget-usd 10] [--repeats 3]'
  const runId = arg('run-id')
  const budgetUsd = Number(arg('budget-usd', 10))
  const repeats = Number(arg('repeats', 3))
  if (!runId || !Number.isFinite(budgetUsd) || budgetUsd <= 0 || !Number.isInteger(repeats) || repeats < 1) { console.error(usage); process.exit(2) }
  const res = runPersonaTest({ runId, budgetUsd, repeats })
  const md = formatPersonaReport(res.summary, res.run, res.rows.filter(r => r.status === 'failed'))
  writeFileSync(join(res.dir, 'report.md'), md)
  console.log(md)
  if (res.stoppedBy === 'no-claude') { console.error('claude is not on the PATH. Install Claude Code or fix PATH, then rerun.'); process.exit(1) }
  if (res.stoppedBy === 'failures') { console.error(`Stopped after ${MAX_FAILURE_STREAK} failed calls in a row. Last error: ${res.lastError}. Rerun to resume.`); process.exit(1) }
  if (res.stoppedBy === 'budget') console.error('Stopped at the budget cap; the run is partial. Raise --budget-usd and rerun to continue.')
}
```

Note: `run.latest()` returns the newest row per key, and a failed row is retried on the next run, so the newest row for a key that later succeeded is `ok`.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: all pass (198).

- [ ] **Step 6: Check the CLI without spending**

Run: `node evals/persona.mjs` (no arguments)
Expected: the usage line, exit code 2. Do NOT run it with a run id: that calls the paid CLI.

- [ ] **Step 7: Commit**

```bash
git add evals/lib/persona-core.mjs evals/persona.mjs tests/evals-persona.test.mjs
git commit -m "feat(evals): persona test runner with budget, resume, and report

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: README

**Files:**
- Modify: `evals/README.md`

- [ ] **Step 1: Add a section**

Add a section `## Persona test` after the probe section, in the README's existing style (short sentences, commands in code blocks). It must say:

- What it tests: whether the voter's identity block changes faithfulness and stability. The 3 versions: v1 name plus description, v2 name plus criteria (production), v3 criteria only.
- The command: `node evals/persona.mjs --run-id <id> --budget-usd 10`, with `--repeats` (default 3). The default budget is $10.
- The calls: 7 voters × 3 versions × repeats voter calls with no tools, then one opus judge call per valid ballot.
- The input: the dossier of `evals/fixtures/2026-11-11-cli-language/` and `evals/persona-voters.json`. An edit to either the vote prompt or the voters file reruns the calls on the same run id.
- The measures and the decision rule, as in the spec.
- Rerunning a finished run id re-prints the report and writes `report.md` without new calls.

- [ ] **Step 2: Check and commit**

Run: `npm test` (expected: all pass; `tests/docs.test.mjs` must still pass).

```bash
git add evals/README.md
git commit -m "docs(evals): how to run the persona test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The pilot run (user checkpoint)

This task spends money and needs the user's go-ahead.

- [ ] **Step 1:** Ask the user to approve the run: 63 voter calls and up to 63 judge calls, with a $10 cap.
- [ ] **Step 2:** Run `node evals/persona.mjs --run-id 2026-11-12-persona1 --budget-usd 10`.
- [ ] **Step 3:** Show the results one measure at a time: a short table, then what was right, what was wrong, and what to improve.
- [ ] **Step 4:** Write `evals/FINDINGS-2026-11-12-personas.md`, including whether the 7-language follow-up is needed, and commit it.
