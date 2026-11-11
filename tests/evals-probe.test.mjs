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
