import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadHelpers } from './harness.mjs'

const { validateBallot, citationCounts } = loadHelpers('validateBallot', 'citationCounts')

const labels = ['K', 'M', 'B']
const ids = new Set(['K-C1', 'M-C1', 'B-C1', 'R1'])
const good = {
  ranking: ['K', 'M', 'B'],
  reasons: [
    { higher: 'K', lower: 'M', reason: 'tested', cites: ['K-C1'] },
    { higher: 'M', lower: 'B', reason: 'ruling', cites: ['R1', 'NOPE'] },
  ],
}

test('a full ranking with a cited reason for each adjacent pair is valid', () => {
  assert.deepEqual(validateBallot(good, labels, ids), { valid: true, problems: [] })
})

test('a partial or duplicated ranking is invalid', () => {
  assert.equal(validateBallot({ ...good, ranking: ['K', 'M'] }, labels, ids).valid, false)
  assert.equal(validateBallot({ ...good, ranking: ['K', 'K', 'B'] }, labels, ids).valid, false)
  assert.equal(validateBallot({ ...good, ranking: ['K', 'M', 'Q'] }, labels, ids).valid, false)
})

test('a missing pair reason is invalid', () => {
  const v = validateBallot({ ...good, reasons: [good.reasons[0]] }, labels, ids)
  assert.deepEqual(v.problems, ['no reason for M over B'])
})

test('a reason that cites no valid dossier ID is invalid', () => {
  const bad = { ...good, reasons: [good.reasons[0], { higher: 'M', lower: 'B', reason: 'gut feel', cites: ['M'] }] }
  assert.deepEqual(validateBallot(bad, labels, ids).problems, ['reason for M over B cites no dossier ID'])
})

test('citationCounts counts voters per valid ID, most cited first', () => {
  const b2 = { reasons: [{ cites: ['K-C1', 'K-C1'] }, { cites: ['B-C1'] }] }
  assert.deepEqual(citationCounts([good, b2], ids), [
    { id: 'K-C1', voters: 2 }, { id: 'R1', voters: 1 }, { id: 'B-C1', voters: 1 },
  ])
})
