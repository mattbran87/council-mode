import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadHelpers } from './harness.mjs'

const { pairwiseTable, condorcetWinner, bordaScores, tally } =
  loadHelpers('pairwiseTable', 'condorcetWinner', 'bordaScores', 'tally')

const L = ['B', 'D', 'F']
const ballots = rankings => rankings.map(ranking => ({ ranking, unacceptable: [] }))
const times = (n, r) => Array.from({ length: n }, () => r)

test('pairwiseTable counts voters who rank a above b', () => {
  const m = pairwiseTable(L, [['B', 'D', 'F'], ['D', 'B', 'F']])
  assert.equal(m.B.D, 1)
  assert.equal(m.D.B, 1)
  assert.equal(m.B.F, 2)
  assert.equal(m.F.B, 0)
})

test('Condorcet keeps the compromise option that instant runoff would drop (center squeeze)', () => {
  // First choices: B 3, F 3, D 1. Instant runoff drops D first, but D beats both rivals head to head.
  const r = [...times(3, ['B', 'D', 'F']), ...times(3, ['F', 'D', 'B']), ['D', 'B', 'F']]
  const result = tally(L, ballots(r))
  assert.equal(result.method, 'condorcet')
  assert.equal(result.winner, 'D')
  assert.equal(result.voters, 7)
})

test('a Condorcet cycle falls back to Borda', () => {
  // B beats D 3-2, D beats F 4-1, F beats B 3-2. Borda: B 5, D 6, F 4.
  const r = [...times(2, ['B', 'D', 'F']), ...times(2, ['D', 'F', 'B']), ['F', 'B', 'D']]
  assert.equal(condorcetWinner(L, pairwiseTable(L, r)), null)
  assert.deepEqual(bordaScores(L, r), { B: 5, D: 6, F: 4 })
  const result = tally(L, ballots(r))
  assert.equal(result.method, 'borda')
  assert.equal(result.winner, 'D')
})

test('a Borda tie is reported as a tie with no winner', () => {
  const r = [['B', 'D', 'F'], ['D', 'F', 'B'], ['F', 'B', 'D']]
  const result = tally(L, ballots(r))
  assert.equal(result.method, 'tie')
  assert.equal(result.winner, null)
  assert.deepEqual(result.tied, ['B', 'D', 'F'])
})

test('no ballots is a tie of every option', () => {
  const result = tally(L, [])
  assert.equal(result.method, 'tie')
  assert.deepEqual(result.tied, L)
  assert.equal(tally(L, []).voters, 0)
})

test('2 or more unacceptable marks on the winner flag the result as fragile', () => {
  const b = ballots(times(5, ['B', 'D', 'F']))
  b[0].unacceptable = ['B']
  assert.equal(tally(L, b).fragile, false)
  b[1].unacceptable = ['B', 'F']
  const result = tally(L, b)
  assert.equal(result.fragile, true)
  assert.equal(result.unacceptableVotes, 2)
})
