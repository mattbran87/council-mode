import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { listFixtures, loadFixture } from '../evals/lib/fixture.mjs'
import { H } from '../evals/lib/helpers.mjs'

const FIRST = fileURLToPath(new URL('../evals/fixtures/2026-11-11-cli-language/', import.meta.url))

test('helpers load from the workflow script', () => {
  assert.equal(typeof H.tally, 'function')
  assert.equal(H.RULING_SCHEMA.type, 'object')
})

test('listFixtures finds the first fixture', () => {
  assert.ok(listFixtures().some(d => d.replace(/\\/g, '/').endsWith('fixtures/2026-11-11-cli-language')))
})

test('loadFixture reads meta, the workflow result, and the journal', () => {
  const fx = loadFixture(FIRST)
  assert.equal(fx.meta.scriptCommit, '9b6455d')
  assert.deepEqual(fx.meta.thresholds, { sycophancy: 0.75, stubbornAdverse: 1 })
  assert.equal(fx.top.agentCount, 62)
  assert.equal(fx.run.options.length, 7)
  assert.equal(fx.journal.length, 125)
})
