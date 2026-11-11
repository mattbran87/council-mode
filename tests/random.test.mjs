import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadHelpers } from './harness.mjs'

const { makeRng, shuffle, assignLabels, LABEL_LETTERS } = loadHelpers('makeRng', 'shuffle', 'assignLabels', 'LABEL_LETTERS')

test('makeRng is deterministic for a seed and stays in [0, 1)', () => {
  const a = makeRng(42), b = makeRng(42)
  for (let i = 0; i < 100; i++) {
    const x = a()
    assert.equal(x, b())
    assert.ok(x >= 0 && x < 1)
  }
})

test('different seeds give different sequences', () => {
  assert.notEqual(makeRng(1)(), makeRng(2)())
})

test('shuffle keeps every item and does not change the input', () => {
  const input = ['B', 'D', 'F', 'G']
  const out = shuffle(input, makeRng(7))
  assert.deepEqual([...out].sort(), [...input].sort())
  assert.deepEqual(input, ['B', 'D', 'F', 'G'])
})

test('assignLabels gives unique letters from the allowed list', () => {
  const opts = [{ description: 'a' }, { description: 'b' }, { description: 'c' }, { description: 'd' }]
  const labeled = assignLabels(opts, makeRng(3))
  const letters = labeled.map(o => o.label)
  assert.equal(new Set(letters).size, 4)
  for (const l of letters) assert.ok(LABEL_LETTERS.includes(l))
  assert.equal(labeled[0].description, 'a')
})

test('assignLabels throws when there are more options than letters', () => {
  const many = Array.from({ length: LABEL_LETTERS.length + 1 }, (_, i) => ({ description: String(i) }))
  assert.throws(() => assignLabels(many, makeRng(1)), /too many options/)
})
