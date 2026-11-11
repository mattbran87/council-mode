import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

function tmpFixture(result, journal) {
  const dir = mkdtempSync(join(tmpdir(), 'fx-'))
  writeFileSync(join(dir, 'meta.json'), '{}')
  writeFileSync(join(dir, 'result.json'), JSON.stringify(result))
  if (journal !== undefined) writeFileSync(join(dir, 'journal.jsonl'), journal)
  return dir
}

test('a malformed journal line names the file and line number', () => {
  const dir = tmpFixture({ result: {} }, '{"a":1}\r\n\r\n{bad\r\n')
  assert.throws(() => loadFixture(dir), /journal\.jsonl:3: /)
})

test('result null is rejected', () => {
  assert.throws(() => loadFixture(tmpFixture({ result: null })), /result\.json: result\.json has no workflow result/)
})
