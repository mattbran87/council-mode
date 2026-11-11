import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadHelpers } from './harness.mjs'

const { numberCase, indexClaims, collectChallenges, applyRewrites, classifyReplies, flipStats } =
  loadHelpers('numberCase', 'indexClaims', 'collectChallenges', 'applyRewrites', 'classifyReplies', 'flipStats')

const raw = {
  claims: [
    { evidence: 'tested', text: 'fast', source: 'log.txt', confidence: 80 },
    { evidence: 'reasoned', text: 'simple', confidence: 60 },
  ],
  weaknesses: ['needs migration', 'no CI'],
  failedTests: [],
}
const cases = [numberCase('K', raw), numberCase('M', raw), numberCase('B', raw)]
const index = indexClaims(cases)

test('numberCase assigns claim and weakness IDs', () => {
  const k = cases[0]
  assert.deepEqual(k.claims.map(c => c.id), ['K-C1', 'K-C2'])
  assert.deepEqual(k.weaknesses.map(w => w.id), ['K-W1', 'K-W2'])
  assert.equal(k.claims[1].source, '')
})

test('indexClaims maps claim IDs to their option label', () => {
  assert.equal(index['M-C2'].label, 'M')
  assert.equal(index['M-C2'].confidence, 60)
})

test('collectChallenges rejects missing evidence, own claims, unknown claims, and a third challenge per rival', () => {
  const { accepted, rejected } = collectChallenges([
    { from: 'K', challenges: [
      { targetClaim: 'M-C1', text: 'too slow', evidence: 'bench.txt' },
      { targetClaim: 'M-C2', text: 'not simple', evidence: 'diff' },
      { targetClaim: 'M-C2', text: 'again', evidence: 'x' },
      { targetClaim: 'B-C1', text: 'no proof', evidence: '  ' },
      { targetClaim: 'K-C1', text: 'self', evidence: 'x' },
      { targetClaim: 'Z-C9', text: 'ghost', evidence: 'x' },
    ] },
  ], index)
  assert.deepEqual(accepted.map(c => c.id), ['CH1', 'CH2'])
  assert.equal(accepted[0].against, 'M')
  assert.deepEqual(rejected.map(r => r.why), ['over limit', 'no evidence', 'own claim', 'unknown claim'])
})

test('applyRewrites replaces text by ID and keeps the original when a rewrite is missing or empty', () => {
  const chs = [{ id: 'CH1', text: 'clearly wrong' }, { id: 'CH2', text: 'keep me' }, { id: 'CH3', text: 'also keep' }]
  const out = applyRewrites(chs, [{ id: 'CH1', text: 'wrong' }, { id: 'CH3', text: ' ' }])
  assert.deepEqual(out.map(c => c.text), ['wrong', 'keep me', 'also keep'])
})

test('classifyReplies sorts concessions, voided concessions, disputes, unanswered, and unexplained drops', () => {
  const chs = [
    { id: 'CH1', targetClaim: 'M-C1', against: 'M' },
    { id: 'CH2', targetClaim: 'M-C2', against: 'M' },
    { id: 'CH3', targetClaim: 'K-C1', against: 'K' },
    { id: 'CH4', targetClaim: 'K-C2', against: 'K' },
  ]
  const out = classifyReplies(chs, [
    { from: 'M', replies: [
      { challengeId: 'CH1', kind: 'concede', evidence: 'bench shows 90 ms', newConfidence: 20, dropReason: 'bench shows 90 ms', reason: '' },
      { challengeId: 'CH2', kind: 'concede', evidence: '', newConfidence: 60, reason: 'fine' },
    ] },
    { from: 'K', replies: [
      { challengeId: 'CH3', kind: 'refute', evidence: '', newConfidence: 50, dropReason: '', reason: 'disagree' },
    ] },
  ], index)
  assert.deepEqual(out.concessions.map(x => [x.id, x.challenge.id]), [['X1', 'CH1']])
  assert.deepEqual(out.voided.map(v => v.challenge.id), ['CH2'])
  assert.deepEqual(out.disputes.map(d => [d.id, d.challenge.id]), [['R1', 'CH3']])
  assert.deepEqual(out.unanswered.map(u => [u.id, u.challenge.id]), [['U1', 'CH4']])
  assert.deepEqual(out.drops, [{ claim: 'K-C1', from: 80, to: 50 }])
})

test('flipStats warns on sycophancy at the threshold and on stubbornness', () => {
  const chs = [
    { id: 'CH1', against: 'M' }, { id: 'CH2', against: 'M' }, { id: 'CH3', against: 'M' }, { id: 'CH4', against: 'M' },
    { id: 'CH5', against: 'K' },
  ]
  const classified = {
    concessions: [{ challenge: chs[0] }, { challenge: chs[1] }],
    voided: [{ challenge: chs[2] }],
    disputes: [], unanswered: [], drops: [],
  }
  const rulings = [{ against: 'K', claimHolds: false }]
  const stats = flipStats(['K', 'M', 'B'], chs, classified, rulings)
  assert.deepEqual(stats.find(s => s.label === 'M').warnings, ['sycophancy'])
  assert.deepEqual(stats.find(s => s.label === 'K').warnings, ['stubbornness'])
  assert.deepEqual(stats.find(s => s.label === 'B'), { label: 'B', challenged: 0, conceded: 0, adverse: 0, warnings: [] })
})

test('flipStats accepts a custom sycophancy threshold', () => {
  const chs = [{ id: 'CH1', against: 'M' }, { id: 'CH2', against: 'M' }]
  const classified = { concessions: [{ challenge: chs[0] }], voided: [], disputes: [], unanswered: [], drops: [] }
  const stats = flipStats(['M'], chs, classified, [], { sycophancy: 0.5 })
  assert.deepEqual(stats[0].warnings, ['sycophancy'])
})

const sc = [
  { id: 'CH1', targetClaim: 'M-C1', against: 'M' },
  { id: 'CH2', targetClaim: 'K-C1', against: 'K' },
]

test('classifyReplies records unknown IDs and replies from the wrong option as stray', () => {
  const out = classifyReplies(sc, [
    { from: 'M', replies: [
      { challengeId: 'CH9', kind: 'concede', evidence: 'x', newConfidence: 10, reason: '' },
      { challengeId: 'CH2', kind: 'concede', evidence: 'x', newConfidence: 10, reason: '' },
    ] },
  ], index)
  assert.deepEqual(out.stray, [{ from: 'M', challengeId: 'CH9' }, { from: 'M', challengeId: 'CH2' }])
  assert.deepEqual(out.unanswered.map(u => [u.id, u.challenge.id]), [['U1', 'CH1'], ['U2', 'CH2']])
  assert.deepEqual(out.concessions, [])
  assert.deepEqual(out.drops, [])
})

test('classifyReplies counts the first reply per challenge and records duplicates', () => {
  const out = classifyReplies(sc, [
    { from: 'M', replies: [
      { challengeId: 'CH1', kind: 'concede', evidence: 'bench', newConfidence: 70, reason: '' },
      { challengeId: 'CH1', kind: 'refute', evidence: '', newConfidence: 70, reason: 'no' },
    ] },
  ], index)
  assert.equal(out.concessions.length, 1)
  assert.deepEqual(out.disputes, [])
  assert.deepEqual(out.duplicates, [{ from: 'M', challengeId: 'CH1' }])
  assert.deepEqual(Object.keys(out).sort(), ['concessions', 'disputes', 'drops', 'duplicates', 'stray', 'unanswered', 'voided'])
})

test('classifyReplies tolerates a round without replies', () => {
  const out = classifyReplies(sc, [{ from: 'M' }], index)
  assert.equal(out.unanswered.length, 2)
})

test('classifyReplies normalizes reply IDs and records non-object entries as stray', () => {
  const out = classifyReplies(sc, [
    { from: 'M', replies: [
      { challengeId: ' ch1 ', kind: 'concede', evidence: 'bench', newConfidence: 70, reason: '' },
      null,
    ] },
  ], index)
  assert.equal(out.concessions.length, 1)
  assert.deepEqual(out.stray, [{ from: 'M', challengeId: '' }])
})

test('flipStats ignores a non-numeric sycophancy threshold', () => {
  const chs = [{ id: 'CH1', against: 'M' }]
  const classified = { concessions: [{ challenge: chs[0] }], voided: [], disputes: [], unanswered: [], drops: [] }
  const stats = flipStats(['M'], chs, classified, [], { sycophancy: undefined })
  assert.deepEqual(stats[0].warnings, ['sycophancy'])
  const none = flipStats(['M'], [chs[0], { id: 'CH2', against: 'M' }], classified, [], { sycophancy: undefined })
  assert.deepEqual(none[0].warnings, [])
})

test('collectChallenges normalizes target IDs and tolerates missing challenges', () => {
  const { accepted } = collectChallenges([
    { from: 'K', challenges: [{ targetClaim: ' m-c1 ', text: 't', evidence: 'e' }] },
    { from: 'M' },
  ], index)
  assert.equal(accepted.length, 1)
  assert.equal(accepted[0].targetClaim, 'M-C1')
})

test('classifyReplies flags a confidence drop with an empty dropReason even when the reply has evidence', () => {
  const chs = [{ id: 'CH1', targetClaim: 'K-C1', against: 'K' }]
  const out = classifyReplies(chs, [{ from: 'K', replies: [
    { challengeId: 'CH1', kind: 'refute', evidence: 'log shows ok', newConfidence: 50, dropReason: '  ', reason: 'r' },
  ] }], index)
  assert.deepEqual(out.drops, [{ claim: 'K-C1', from: 80, to: 50 }])
})

test('classifyReplies does not flag a drop that has a dropReason', () => {
  const chs = [{ id: 'CH1', targetClaim: 'K-C1', against: 'K' }]
  const out = classifyReplies(chs, [{ from: 'K', replies: [
    { challengeId: 'CH1', kind: 'refute', evidence: '', newConfidence: 50, dropReason: 'the bench run', reason: 'r' },
  ] }], index)
  assert.deepEqual(out.drops, [])
})
