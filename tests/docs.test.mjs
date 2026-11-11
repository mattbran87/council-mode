import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const doc = readFileSync(new URL('../docs/architecture.md', import.meta.url), 'utf8')
const script = readFileSync(new URL('../plugins/council-mode/skills/council/council.workflow.js', import.meta.url), 'utf8')

test('the doc has at least 3 Mermaid diagrams', () => {
  assert.ok((doc.match(/```mermaid/g) || []).length >= 3)
})

test('the doc names every workflow phase', () => {
  const titles = [...script.matchAll(/\{ title: '([^']+)'/g)].map(m => m[1])
  assert.equal(titles.length, 7)
  for (const t of titles) assert.ok(doc.includes(t), t)
})

test('the doc names every field of the workflow result', () => {
  for (const field of ['options', 'dossier', 'rejectedChallenges', 'result', 'citations', 'ballots', 'discarded', 'warnings', 'stopped']) {
    assert.ok(doc.includes(`\`${field}\``), field)
  }
})

test('the doc explains every ID prefix', () => {
  for (const id of ['K-C1', 'K-W1', 'CH1', 'R1', 'X1', 'U1']) assert.ok(doc.includes(id), id)
})
