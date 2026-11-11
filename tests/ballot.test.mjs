import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadHelpers } from './harness.mjs'

const { normalizeBallot, validateBallot, citationCounts } = loadHelpers('normalizeBallot', 'validateBallot', 'citationCounts')

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
  const b2 = { ranking: ['K', 'B', 'M'], reasons: [
    { higher: 'K', lower: 'B', cites: ['K-C1', 'K-C1'] }, { higher: 'B', lower: 'M', cites: ['B-C1'] }] }
  assert.deepEqual(citationCounts([good, b2], ids), [
    { id: 'K-C1', voters: 2 }, { id: 'R1', voters: 1 }, { id: 'B-C1', voters: 1 },
  ])
})

test('citationCounts ignores reasons for non-adjacent pairs', () => {
  const b = { ranking: ['K', 'M', 'B'], reasons: [
    { higher: 'K', lower: 'M', cites: ['K-C1'] }, { higher: 'K', lower: 'B', cites: ['B-C1'] }] }
  assert.deepEqual(citationCounts([b], ids), [{ id: 'K-C1', voters: 1 }])
})

test('the full-ranking message names the ranking and the labels', () => {
  assert.deepEqual(validateBallot({ ...good, ranking: ['K', 'M'] }, labels, ids).problems,
    ['ranking [K, M] is not a full ranking of K, M, B'])
})

test('a reversed reason is reported as reversed', () => {
  const v = validateBallot({ ...good, reasons: [good.reasons[0], { higher: 'B', lower: 'M', reason: 'x', cites: ['R1'] }] }, labels, ids)
  assert.deepEqual(v.problems, ['reason for M over B is reversed'])
})

test('absent reasons are invalid', () => {
  const v = validateBallot({ ranking: ['K', 'M', 'B'] }, labels, ids)
  assert.equal(v.valid, false)
  assert.match(v.problems[0], /no reason/)
})

test('for a duplicated pair the first reason wins', () => {
  const dup = { ...good, reasons: [good.reasons[0],
    { higher: 'M', lower: 'B', reason: 'a', cites: [] }, { higher: 'M', lower: 'B', reason: 'b', cites: ['R1'] }] }
  assert.equal(validateBallot(dup, labels, ids).valid, false)
})

test('normalizeBallot cleans labels, cites and unacceptable, keeping other fields', () => {
  const n = normalizeBallot({
    persona: 'p', model: 'm', ranking: ['Option K', 'm', ' B'],
    reasons: [{ higher: 'Option K', lower: 'm', reason: 'r', cites: ['k-c1', '[R1].', 'nope', 'K-C1'] }],
    unacceptable: ['Option K', 'Q'],
  }, labels, ids)
  assert.deepEqual(n.ranking, ['K', 'M', 'B'])
  assert.equal(n.reasons[0].higher, 'K')
  assert.equal(n.reasons[0].lower, 'M')
  assert.deepEqual(n.reasons[0].cites, ['K-C1', 'R1'])
  assert.deepEqual(n.unacceptable, ['K'])
  assert.equal(n.persona, 'p')
  assert.equal(n.model, 'm')
  assert.deepEqual(normalizeBallot({}, labels, ids), { ranking: [], reasons: [], unacceptable: [] })
})

test('normalizeBallot keeps unknown ranking labels so validation fails', () => {
  assert.deepEqual(normalizeBallot({ ranking: ['Option Q'] }, labels, ids).ranking, ['Q'])
})
