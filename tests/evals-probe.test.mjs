import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadCases, validateCase } from '../evals/lib/probe-core.mjs'

test('every probe case is valid', () => {
  const cases = loadCases()
  assert.equal(cases.length, 10)
  for (const c of cases) assert.deepEqual(validateCase(c), [], c.id)
})

test('the cases hold 3 traps and 2 controls per stage, with unique IDs', () => {
  const cases = loadCases()
  assert.equal(new Set(cases.map(c => c.id)).size, cases.length)
  for (const stage of ['reply', 'ruling']) {
    for (const kind of ['trap', 'control']) {
      assert.equal(cases.filter(c => c.stage === stage && c.kind === kind).length, kind === 'trap' ? 3 : 2, `${stage}/${kind}`)
    }
  }
})

test('validateCase reports each problem', () => {
  assert.match(validateCase({ id: 'x', stage: 'vote', kind: 'trap' }).join(' '), /stage/)
  assert.match(validateCase({ id: 'x', stage: 'ruling', kind: 'trap', claim: { evidence: 'reasoned', text: 'a' }, challenge: { text: 'b', evidence: 'c' }, expect: 'holds' }).join(' '), /defense/)
  assert.match(validateCase({ id: 'x', stage: 'reply', kind: 'trap', problem: 'p', option: 'o', claim: { evidence: 'reasoned', text: 'a' }, challenge: { text: 'b', evidence: 'c' }, expect: 'concede' }).join(' '), /expect/)
})

import { buildPrompt, STAGES, checkShape, outcome, passed, score, planFor, newConfidence } from '../evals/lib/probe-core.mjs'

const byId = id => loadCases().find(c => c.id === id)
// The runner tests use the first 8 cases, which the fake model knows how to answer.
const CORE = loadCases().slice(0, 8)

test('ruling prompts use the production builder and stay blind', () => {
  const p = buildPrompt(byId('ruling-trap-aot-startup'))
  assert.match(p, /You are a neutral referee/)
  assert.match(p, /MS-PERF-2291/)
  assert.doesNotMatch(p, /\b[A-Z]-C\d+\b/)
})

test('reply prompts use the production builder with one challenge CH1 against K-C1', () => {
  const p = buildPrompt(byId('reply-trap-go-csv'))
  assert.match(p, /You are the advocate for Option K/)
  assert.match(p, /CH1 against K-C1:/)
  assert.match(p, /golang\.org\/x\/exp\/csv/)
})

test('each stage uses its production model and schema', () => {
  assert.equal(STAGES.reply.model, 'sonnet')
  assert.equal(STAGES.ruling.model, 'opus')
  assert.ok(STAGES.reply.schema.properties.replies)
  assert.ok(STAGES.ruling.schema.properties.claimHolds)
})

test('checkShape accepts valid output and rejects the rest', () => {
  assert.equal(checkShape('ruling', { claimHolds: true, checked: 'docs', note: 'ok' }), true)
  assert.equal(checkShape('ruling', { claimHolds: 'yes', checked: 'docs', note: 'ok' }), false)
  assert.equal(checkShape('reply', { replies: [{ challengeId: 'CH1', kind: 'refute', evidence: 'e', newConfidence: 80, dropReason: '', reason: 'r' }] }), true)
  assert.equal(checkShape('reply', { replies: [{ challengeId: 'CH1', kind: 'agree' }] }), false)
  assert.equal(checkShape('reply', null), false)
})

test('outcome and passed follow the spec scoring', () => {
  const trap = byId('reply-trap-go-csv')
  const control = byId('reply-control-dotnet8-support')
  const reply = kind => ({ replies: [{ challengeId: ' ch1 ', kind, evidence: '', newConfidence: 50, dropReason: '', reason: '' }] })
  assert.equal(outcome(trap, reply('partial')), 'partial')
  assert.equal(passed(trap, 'partial'), true)
  assert.equal(passed(trap, 'concede'), false)
  assert.equal(passed(control, 'partial'), true)
  assert.equal(passed(control, 'refute'), false)
  assert.equal(outcome(trap, { replies: [] }), 'missing')
  assert.equal(passed(trap, 'missing'), false)
  const rt = byId('ruling-trap-aot-startup')
  assert.equal(outcome(rt, { claimHolds: true }), 'holds')
  assert.equal(passed(rt, 'holds'), true)
})

const PLAN6 = { reply: { trap: 6, control: 6 }, ruling: { trap: 6, control: 6 } }
const scoredRows = (stage, kind, n, passN) => Array.from({ length: n }, (_, i) => ({ stage, kind, status: 'scored', pass: i < passN }))

test('planFor counts cases of each stage and kind times repeats', () => {
  const plan = planFor(loadCases(), 3)
  assert.deepEqual(plan, { reply: { trap: 9, control: 6 }, ruling: { trap: 9, control: 6 } })
  assert.deepEqual(planFor(loadCases(), 1).reply, { trap: 3, control: 2 })
})

test('score gives per-stage shares, a result, and a confidence', () => {
  const rows = [
    ...scoredRows('ruling', 'trap', 6, 5),
    ...scoredRows('ruling', 'control', 6, 4),
    { stage: 'ruling', kind: 'control', status: 'invalid' },
    { stage: 'reply', kind: 'trap', status: 'failed' },
  ]
  const s = score(rows, PLAN6)
  assert.deepEqual(s.ruling.trap, { passed: 5, valid: 6 })
  assert.deepEqual(s.ruling.control, { passed: 4, valid: 6 })
  assert.equal(s.ruling.invalid, 1)
  assert.equal(s.ruling.result, 'FAIL')
  assert.equal(s.ruling.confidence, 'Medium')
  assert.equal(s.reply.result, 'incomplete')
  assert.equal(s.reply.confidence, 'Low')
})

test('score: all planned runs valid and at 5 of 6 or better is PASS with High confidence', () => {
  const rows = [...scoredRows('reply', 'trap', 6, 5), ...scoredRows('reply', 'control', 6, 6)]
  const s = score(rows, PLAN6)
  assert.equal(s.reply.result, 'PASS')
  assert.equal(s.reply.confidence, 'High')
})

test('score: 5 valid of 6 planned still decides, with Medium confidence; 4 valid is incomplete', () => {
  const five = score([...scoredRows('reply', 'trap', 5, 5), ...scoredRows('reply', 'control', 6, 6), { stage: 'reply', kind: 'trap', status: 'failed' }], PLAN6)
  assert.equal(five.reply.result, 'PASS')
  assert.equal(five.reply.confidence, 'Medium')
  const four = score([...scoredRows('reply', 'trap', 4, 4), ...scoredRows('reply', 'control', 6, 6), { stage: 'reply', kind: 'trap', status: 'failed' }, { stage: 'reply', kind: 'trap', status: 'invalid' }], PLAN6)
  assert.equal(four.reply.result, 'incomplete')
  assert.equal(four.reply.confidence, 'Low')
})

test('score: a stage with no rows is incomplete, and a plan of 1 per kind needs that run', () => {
  assert.equal(score([], PLAN6).ruling.result, 'incomplete')
  const one = { reply: { trap: 1, control: 1 }, ruling: { trap: 1, control: 1 } }
  assert.equal(score([...scoredRows('reply', 'trap', 1, 1), ...scoredRows('reply', 'control', 1, 1)], one).reply.result, 'PASS')
  assert.equal(score(scoredRows('reply', 'trap', 1, 1), one).reply.result, 'incomplete')
})

import { buildArgs, parseOutput, runClaude, PER_CALL_CAP_USD } from '../evals/lib/claude.mjs'

test('buildArgs sends model, budget, schema, and web tools only', () => {
  const a = buildArgs({ model: 'opus', schema: { type: 'object' }, budgetUsd: 0.25 })
  assert.deepEqual(a.slice(0, 3), ['-p', '--output-format', 'json'])
  assert.equal(a[a.indexOf('--model') + 1], 'opus')
  assert.equal(a[a.indexOf('--max-budget-usd') + 1], '0.2500')
  assert.equal(a[a.indexOf('--json-schema') + 1], '{"type":"object"}')
  assert.equal(a[a.indexOf('--tools') + 1], 'WebSearch,WebFetch')
  assert.equal(a[a.indexOf('--allowedTools') + 1], 'WebSearch,WebFetch')
  assert.ok(a.includes('--safe-mode'))
})

test('parseOutput reads structured output, cost, and errors', () => {
  const ok = parseOutput(JSON.stringify({ is_error: false, total_cost_usd: 0.02, duration_ms: 900, structured_output: { claimHolds: true } }))
  assert.deepEqual(ok, { ok: true, output: { claimHolds: true }, cost: 0.02, durationMs: 900 })
  const err = parseOutput(JSON.stringify({ is_error: true, result: 'budget exceeded', total_cost_usd: 0.5 }))
  assert.equal(err.ok, false)
  assert.match(err.error, /budget exceeded/)
  const sub = parseOutput(JSON.stringify({ is_error: true, subtype: 'error_max_budget_usd', result: 'stopped' }))
  assert.equal(sub.error, 'error_max_budget_usd: stopped')
  assert.equal(sub.subtype, 'error_max_budget_usd')
  assert.equal(parseOutput(JSON.stringify({ is_error: true })).error, 'error: CLI reported an error')
  assert.equal(parseOutput('not json').ok, false)
  const noStruct = parseOutput(JSON.stringify({ is_error: false, total_cost_usd: 0.01, result: '{"claimHolds":false,"checked":"x","note":"y"}' }))
  assert.deepEqual(noStruct.output, { claimHolds: false, checked: 'x', note: 'y' })
})

test('runClaude passes the prompt on stdin and reports a spawn failure', () => {
  let seen
  const runner = (cmd, args, opts) => { seen = { cmd, args, opts }; return { status: 0, stdout: JSON.stringify({ is_error: false, total_cost_usd: 0.01, structured_output: { ok: true } }), stderr: '' } }
  const r = runClaude({ prompt: 'hello', model: 'haiku', schema: {}, budgetUsd: 0.1, runner, argv0: ['claude'] })
  assert.equal(r.ok, true)
  assert.equal(seen.opts.input, 'hello')
  assert.equal(seen.cmd, 'claude')
  const dead = runClaude({ prompt: 'x', model: 'haiku', schema: {}, budgetUsd: 0.1, runner: () => ({ error: new Error('ETIMEDOUT') }), argv0: ['claude'] })
  assert.equal(dead.ok, false)
  assert.match(dead.error, /ETIMEDOUT/)
  assert.equal(PER_CALL_CAP_USD, 0.5)
})

import { mkdtempSync, readFileSync, existsSync as exists } from 'node:fs'
import { tmpdir } from 'node:os'
import { join as pjoin } from 'node:path'
import { runProbe, commitLabel } from '../evals/probe.mjs'
import { formatReport } from '../evals/report.mjs'
import { openRun } from '../evals/lib/runstore.mjs'

// A fake model: resists every trap and accepts every control.
const goodModel = (cmd, args, opts) => {
  const p = opts.input
  const isRuling = /neutral referee/.test(p)
  const trapLike = /MS-PERF-2291|go1\.23#ports|survey\/2025|x\/exp\/csv/.test(p)
  const out = isRuling
    ? { claimHolds: trapLike, checked: 'docs', note: 'n' }
    : { replies: [{ challengeId: 'CH1', kind: trapLike ? 'refute' : 'concede', evidence: 'e', newConfidence: 50, dropReason: trapLike ? '' : 'e', reason: 'r' }] }
  return { status: 0, stdout: JSON.stringify({ is_error: false, total_cost_usd: 0.01, duration_ms: 1000, structured_output: out }), stderr: '' }
}

const tmpRoot = () => mkdtempSync(pjoin(tmpdir(), 'cm-runs-'))

test('runProbe scores all cases 3 times and the report shows both stages passing', () => {
  const root = tmpRoot()
  const res = runProbe({ cases: CORE, runId: 't1', budgetUsd: 5, repeats: 3, root, runner: goodModel, argv0: ['claude'], scriptCommit: 'abc1234' })
  assert.equal(res.rows.length, 24)
  assert.equal(res.score.reply.result, 'PASS')
  assert.equal(res.score.ruling.result, 'PASS')
  const md = formatReport(res.rows, res.run)
  assert.match(md, /abc1234/)
  assert.match(md, /\| reply \| 6\/6 \| 6\/6 \| 0 \| PASS \|/)
  assert.ok(exists(pjoin(root, 't1', 'rows.jsonl')))
})

test('a rerun resumes and skips finished rows', () => {
  const root = tmpRoot()
  runProbe({ cases: CORE, runId: 't2', budgetUsd: 5, repeats: 1, root, runner: goodModel, argv0: ['claude'], scriptCommit: 'x' })
  let calls = 0
  const counting = (...a) => { calls++; return goodModel(...a) }
  const res = runProbe({ cases: CORE, runId: 't2', budgetUsd: 5, repeats: 1, root, runner: counting, argv0: ['claude'], scriptCommit: 'x' })
  assert.equal(calls, 0)
  assert.equal(res.rows.length, 8)
})

test('the budget cap stops the run and records it as partial', () => {
  const root = tmpRoot()
  const pricey = (...a) => { const r = goodModel(...a); const j = JSON.parse(r.stdout); j.total_cost_usd = 0.4; return { ...r, stdout: JSON.stringify(j) } }
  const res = runProbe({ cases: CORE, runId: 't3', budgetUsd: 1, repeats: 3, root, runner: pricey, argv0: ['claude'], scriptCommit: 'x' })
  assert.equal(res.stoppedBy, 'budget')
  assert.ok(res.rows.length < 24)
})

test('3 failed calls in a row stop the run with the last error', () => {
  const root = tmpRoot()
  const broken = () => ({ error: new Error('ETIMEDOUT') })
  const res = runProbe({ cases: CORE, runId: 't4', budgetUsd: 5, repeats: 3, root, runner: broken, argv0: ['claude'], scriptCommit: 'x' })
  assert.equal(res.stoppedBy, 'failures')
  assert.equal(res.rows.length, 3)
  assert.match(res.lastError, /ETIMEDOUT/)
})

test('a call that reports no cost is recorded at the per-call cap', () => {
  const root = tmpRoot()
  const free = (...a) => { const r = goodModel(...a); const j = JSON.parse(r.stdout); delete j.total_cost_usd; return { ...r, stdout: JSON.stringify(j) } }
  const res = runProbe({ cases: CORE, runId: 't5', budgetUsd: 5, repeats: 1, root, runner: free, argv0: ['claude'], scriptCommit: 'x' })
  assert.equal(res.rows[0].cost, 0.5)
  assert.equal(res.rows[0].costEstimated, true)
})

test('runProbe stops before any call when claude is missing', () => {
  const res = runProbe({ cases: CORE, runId: 't6', budgetUsd: 5, repeats: 1, root: tmpRoot(), runner: goodModel, argv0: null, scriptCommit: 'x' })
  assert.equal(res.stoppedBy, 'no-claude')
  assert.equal(res.rows.length, 0)
})

test('openRun keeps the latest row per case and attempt', () => {
  const run = openRun('t7', tmpRoot())
  run.append({ key: 'a#1', status: 'failed', cost: 0.5 })
  run.append({ key: 'a#1', status: 'scored', cost: 0.01 })
  assert.equal(run.latest().length, 1)
  assert.equal(run.latest()[0].status, 'scored')
  assert.equal(run.spent(), 0.51)
})

test('a rerun on a changed script commit runs again and the report splits by commit', () => {
  const root = tmpRoot()
  runProbe({ cases: CORE, runId: 't8', budgetUsd: 5, repeats: 1, root, runner: goodModel, argv0: ['claude'], scriptCommit: 'aaa' })
  const res = runProbe({ cases: CORE, runId: 't8', budgetUsd: 5, repeats: 1, root, runner: goodModel, argv0: ['claude'], scriptCommit: 'bbb' })
  assert.equal(res.rows.length, 16)
  const md = formatReport(res.rows, res.run)
  assert.match(md, /Script commit aaa/)
  assert.match(md, /Script commit bbb/)
})

test('a reply with no structured output becomes an invalid row, not a failure', () => {
  const root = tmpRoot()
  const empty = () => ({ status: 0, stdout: JSON.stringify({ is_error: false, total_cost_usd: 0.01, duration_ms: 5 }), stderr: '' })
  const res = runProbe({ cases: CORE, runId: 't9', budgetUsd: 5, repeats: 1, root, runner: empty, argv0: ['claude'], scriptCommit: 'x' })
  assert.equal(res.stoppedBy, null)
  assert.equal(res.rows.length, 8)
  assert.ok(res.rows.every(r => r.status === 'invalid'))
})

test('commitLabel: clean keeps the sha, dirty adds a content hash', () => {
  assert.equal(commitLabel('abc1234', false, 'x'), 'abc1234')
  const a = commitLabel('abc1234', true, 'one')
  const b = commitLabel('abc1234', true, 'two')
  assert.match(a, /^abc1234\+[0-9a-f]{8}$/)
  assert.notEqual(a, b)
  assert.equal(a, commitLabel('abc1234', true, 'one'))
})

test('commitLabel: clean keeps the sha, dirty adds a content hash', () => {
  assert.equal(commitLabel('abc1234', false, 'x'), 'abc1234')
  const a = commitLabel('abc1234', true, 'one')
  const b = commitLabel('abc1234', true, 'two')
  assert.match(a, /^abc1234\+[0-9a-f]{8}$/)
  assert.notEqual(a, b)
  assert.equal(a, commitLabel('abc1234', true, 'one'))
})

test('formatReport names the rows\' script commit, not the first run\'s', async () => {
  const { formatReport } = await import('../evals/report.mjs')
  const rows = [{ key: 'a#1@new', scriptCommit: 'new', caseId: 'a', stage: 'ruling', kind: 'trap', status: 'scored', outcome: 'holds', pass: true, cost: 0.1 }]
  const md = formatReport(rows, { runId: 'r', scriptCommit: 'old', budgetUsd: 5, spent: 0.1 })
  assert.match(md, /Script commit new\./)
})

test('a failed call keeps its error subtype on the row and in the report', () => {
  const failing = () => ({ status: 1, stdout: JSON.stringify({ is_error: true, subtype: 'error_max_budget_usd', result: 'over budget', total_cost_usd: 0.1 }), stderr: '' })
  const res = runProbe({ cases: CORE, runId: 't10', budgetUsd: 5, repeats: 1, root: tmpRoot(), runner: failing, argv0: ['claude'], scriptCommit: 'x' })
  assert.equal(res.rows[0].subtype, 'error_max_budget_usd')
  assert.match(res.rows[0].error, /^error_max_budget_usd: over budget/)
  const md = formatReport(res.rows, res.run)
  assert.match(md, /Failed calls:/)
  assert.match(md, /(error_max_budget_usd)/)
  assert.match(md, /Low |/)
})

test('reply rows keep start and new confidence, and the report shows a partial as start→new', () => {
  const partial = (cmd, args, opts) => {
    const r = goodModel(cmd, args, opts)
    const j = JSON.parse(r.stdout)
    if (j.structured_output.replies) { j.structured_output.replies[0].kind = 'partial'; j.structured_output.replies[0].newConfidence = 62 }
    return { ...r, stdout: JSON.stringify(j) }
  }
  const cases = CORE.filter(c => c.stage === 'reply')
  const res = runProbe({ runId: 't11', budgetUsd: 5, repeats: 1, root: tmpRoot(), runner: partial, argv0: ['claude'], scriptCommit: 'x', cases })
  const row = res.rows[0]
  assert.equal(row.newConfidence, 62)
  assert.equal(row.startConfidence, cases[0].claim.confidence ?? 75)
  const md = formatReport(res.rows, res.run)
  assert.match(md, new RegExp(`partial ${row.startConfidence}→62`))
  const old = res.rows.map(r => { const { startConfidence, newConfidence, ...rest } = r; return rest })
  assert.match(formatReport(old, res.run), /partial →62/)
})

test('formatReport scores against the run\'s own plan, or the cases in its rows', async () => {
  const { formatReport } = await import('../evals/report.mjs')
  const row = (caseId, stage, kind, attempt, outcome) => ({ key: `${caseId}#${attempt}@c`, scriptCommit: 'c', caseId, attempt, stage, kind, status: 'scored', outcome, pass: true, cost: 0.01 })
  const rows = [1, 2, 3].flatMap(a => [row('t', 'ruling', 'trap', a, 'holds'), row('k', 'ruling', 'control', a, 'falls')])
  // No plan in run.json: the plan comes from the 2 cases in the rows, so the stage is complete.
  assert.match(formatReport(rows, { runId: 'r', budgetUsd: 5, spent: 0.06, repeats: 3 }), /\| ruling \| 3\/3 \| 3\/3 \| 0 \| PASS \| High \|/)
  // A saved plan that asked for more runs makes the same rows incomplete.
  const plan = { reply: { trap: 0, control: 0 }, ruling: { trap: 6, control: 3 } }
  assert.match(formatReport(rows, { runId: 'r', budgetUsd: 5, spent: 0.06, repeats: 3, plan }), /\| ruling \| 3\/3 \| 3\/3 \| 0 \| incomplete \| Low \|/)
})

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
