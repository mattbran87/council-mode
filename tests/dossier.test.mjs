import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadHelpers } from './harness.mjs'

const { numberCase, buildDossier, dossierIds, renderDossier } =
  loadHelpers('numberCase', 'buildDossier', 'dossierIds', 'renderDossier')

const raw = {
  claims: [
    { evidence: 'tested', text: 'fast', source: 'log.txt', confidence: 80 },
    { evidence: 'reasoned', text: 'simple', confidence: 60 },
  ],
  weaknesses: ['needs migration', 'no CI'],
  failedTests: ['load test at 10k users'],
}
const options = [
  { label: 'K', description: 'alpha approach', baseline: false },
  { label: 'M', description: 'baseline: change nothing', baseline: true },
]
const cases = [numberCase('K', raw), numberCase('M', raw)]
const classified = {
  concessions: [{ id: 'X1', challenge: { targetClaim: 'K-C2', against: 'K' }, evidence: 'diff' }],
  voided: [{ challenge: { targetClaim: 'M-C2', against: 'M' }, reason: '' }],
  disputes: [],
  unanswered: [{ id: 'U1', challenge: { targetClaim: 'M-C1', text: 'slow?', evidence: 'bench' } }],
  drops: [],
}
const rulings = [{ id: 'R1', claim: 'M-C1', against: 'M', claimHolds: false, checked: 'reran bench', note: 'slower' }]
const flips = [
  { label: 'K', challenged: 1, conceded: 1, adverse: 0, warnings: ['sycophancy'] },
  { label: 'M', challenged: 2, conceded: 1, adverse: 1, warnings: [] },
]
const dossier = buildDossier({ problem: 'Pick a cache.', options, cases, classified, rulings, flips })

test('buildDossier marks claim status from rulings and concessions', () => {
  const status = Object.fromEntries(dossier.options.flatMap(o => o.claims.map(c => [c.id, c.status])))
  assert.deepEqual(status, { 'K-C1': 'stands', 'K-C2': 'conceded', 'M-C1': 'struck', 'M-C2': 'stands' })
})

test('dossierIds holds claim, weakness, ruling, concession, and unanswered IDs, but not bare labels', () => {
  const ids = dossierIds(dossier)
  for (const id of ['K-C1', 'M-W2', 'R1', 'X1', 'U1']) assert.ok(ids.has(id), id)
  assert.ok(!ids.has('K'))
})

test('renderDossier follows the given option order and shows every section', () => {
  const text = renderDossier(dossier, ['M', 'K'])
  assert.ok(text.indexOf('### Option M') < text.indexOf('### Option K'))
  for (const part of ['## Problem', 'Pick a cache.', 'K-C1 [tested] fast (log.txt)', 'M-C1', 'struck',
    'R1 on M-C1: claim false', 'X1 K-C2 conceded', 'U1 against M-C1', 'Failed tests: load test at 10k users',
    'Voided concessions', '- M-C2', 'warning: sycophancy']) {
    assert.ok(text.includes(part), part)
  }
})

test('renderDossier writes "none" for empty sections', () => {
  const empty = buildDossier({ problem: 'p', options, cases,
    classified: { concessions: [], voided: [], disputes: [], unanswered: [], drops: [] }, rulings: [], flips })
  const text = renderDossier(empty, ['K', 'M'])
  assert.ok(text.includes('## Referee rulings\n- none'))
})

test('renderDossier never names a model', () => {
  const text = renderDossier(dossier, ['K', 'M'])
  assert.ok(!/sonnet|opus|haiku/i.test(text))
})
