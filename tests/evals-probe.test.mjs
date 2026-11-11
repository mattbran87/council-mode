import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadCases, validateCase } from '../evals/lib/probe-core.mjs'

test('every probe case is valid', () => {
  const cases = loadCases()
  assert.equal(cases.length, 8)
  for (const c of cases) assert.deepEqual(validateCase(c), [], c.id)
})

test('the cases hold 2 traps and 2 controls per stage, with unique IDs', () => {
  const cases = loadCases()
  assert.equal(new Set(cases.map(c => c.id)).size, cases.length)
  for (const stage of ['reply', 'ruling']) {
    for (const kind of ['trap', 'control']) {
      assert.equal(cases.filter(c => c.stage === stage && c.kind === kind).length, 2, `${stage}/${kind}`)
    }
  }
})

test('validateCase reports each problem', () => {
  assert.match(validateCase({ id: 'x', stage: 'vote', kind: 'trap' }).join(' '), /stage/)
  assert.match(validateCase({ id: 'x', stage: 'ruling', kind: 'trap', claim: { evidence: 'reasoned', text: 'a' }, challenge: { text: 'b', evidence: 'c' }, expect: 'holds' }).join(' '), /defense/)
  assert.match(validateCase({ id: 'x', stage: 'reply', kind: 'trap', problem: 'p', option: 'o', claim: { evidence: 'reasoned', text: 'a' }, challenge: { text: 'b', evidence: 'c' }, expect: 'concede' }).join(' '), /expect/)
})

import { buildPrompt, STAGES, checkShape, outcome, passed, score } from '../evals/lib/probe-core.mjs'

const byId = id => loadCases().find(c => c.id === id)

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

test('score gives per-stage shares and passes a stage only at 5 of 6 or better', () => {
  const rows = [
    ...Array.from({ length: 6 }, (_, i) => ({ stage: 'ruling', kind: 'trap', status: 'scored', pass: i < 5 })),
    ...Array.from({ length: 6 }, (_, i) => ({ stage: 'ruling', kind: 'control', status: 'scored', pass: i < 4 })),
    { stage: 'ruling', kind: 'control', status: 'invalid' },
    { stage: 'reply', kind: 'trap', status: 'failed' },
  ]
  const s = score(rows)
  assert.deepEqual(s.ruling.trap, { passed: 5, valid: 6 })
  assert.deepEqual(s.ruling.control, { passed: 4, valid: 6 })
  assert.equal(s.ruling.invalid, 1)
  assert.equal(s.ruling.pass, false)
  assert.equal(s.reply.pass, false)
})

import { buildArgs, parseOutput, runClaude, PER_CALL_CAP_USD } from '../evals/lib/claude.mjs'

test('buildArgs sends model, budget, schema, and web tools only', () => {
  const a = buildArgs({ model: 'opus', schema: { type: 'object' }, budgetUsd: 0.25 })
  assert.deepEqual(a.slice(0, 3), ['-p', '--output-format', 'json'])
  assert.equal(a[a.indexOf('--model') + 1], 'opus')
  assert.equal(a[a.indexOf('--max-budget-usd') + 1], '0.2500')
  assert.equal(a[a.indexOf('--json-schema') + 1], '{"type":"object"}')
  assert.equal(a[a.indexOf('--tools') + 1], 'WebSearch,WebFetch')
})

test('parseOutput reads structured output, cost, and errors', () => {
  const ok = parseOutput(JSON.stringify({ is_error: false, total_cost_usd: 0.02, duration_ms: 900, structured_output: { claimHolds: true } }))
  assert.deepEqual(ok, { ok: true, output: { claimHolds: true }, cost: 0.02, durationMs: 900 })
  const err = parseOutput(JSON.stringify({ is_error: true, result: 'budget exceeded', total_cost_usd: 0.5 }))
  assert.equal(err.ok, false)
  assert.match(err.error, /budget exceeded/)
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
