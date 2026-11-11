import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadHelpers, runWorkflow } from './harness.mjs'

test('loadHelpers returns bindings from the helpers section', () => {
  const { LABEL_LETTERS } = loadHelpers('LABEL_LETTERS')
  assert.ok(LABEL_LETTERS.includes('K'))
})

test('label letters avoid the ID prefixes C, R, U, W, X', () => {
  const { LABEL_LETTERS } = loadHelpers('LABEL_LETTERS')
  for (const reserved of ['C', 'R', 'U', 'W', 'X']) assert.ok(!LABEL_LETTERS.includes(reserved))
})

test('runWorkflow runs the script body', async () => {
  await assert.rejects(runWorkflow({ args: {}, respond: () => null }), /exactly 7/)
})
