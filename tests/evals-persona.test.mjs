import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadVoters, parseCriteria, identityFor, votePromptFor, orderFor, VERSIONS } from '../evals/lib/persona-core.mjs'

const voters = loadVoters()
const nightly = voters.voters.find(v => v.name.startsWith('Nightly-job owner'))

test('the voters file holds the 7 first-run voters and a hash', () => {
  assert.equal(voters.voters.length, 7)
  assert.match(voters.hash, /^[0-9a-f]{8}$/)
  for (const v of voters.voters) {
    assert.ok(v.name && v.model && v.criteria && v.description, v.name)
    assert.equal(parseCriteria(v.criteria).cares.length, 3, v.name)
  }
})

test('parseCriteria splits the criteria sheet', () => {
  const c = parseCriteria(nightly.criteria)
  assert.deepEqual(c.cares, ['startup time per call', 'total runtime over 500 calls', 'predictable memory'])
  assert.equal(c.accepts, 'a slightly slower single run if the total fits the window')
  assert.equal(c.rejects, 'anything that risks missing the 2-hour window')
})

test('v1 has the name and description and no criteria; v2 is production; v3 has the criteria and no name', () => {
  const v1 = identityFor('v1', nightly)
  assert.ok(v1.includes(nightly.name) && v1.includes(nightly.description))
  assert.ok(!/Cares about|Accepts:|Rejects:/.test(v1))
  for (const item of parseCriteria(nightly.criteria).cares) assert.ok(!v1.includes(item), item)
  assert.equal(identityFor('v2', nightly), `You are a voter on a decision panel. Your persona: ${nightly.name}.\nYour criteria sheet:\n${nightly.criteria}`)
  const v3 = identityFor('v3', nightly)
  assert.ok(v3.includes(nightly.criteria))
  assert.ok(!v3.includes(nightly.name) && !v3.includes('persona'))
  assert.throws(() => identityFor('v4', nightly))
})

test('the versions differ only in the identity block', () => {
  const tail = p => p.slice(p.indexOf('\n\nRank every option'))
  const prompts = VERSIONS.map(v => votePromptFor(v, nightly, 'DOSSIER', ['M', 'K']))
  assert.equal(new Set(prompts.map(tail)).size, 1)
  assert.equal(new Set(prompts).size, 3)
})

test('orderFor matches the production voter order and is stable', () => {
  const labels = ['B', 'D', 'F', 'G', 'H', 'J', 'K']
  const a = orderFor(20261112, 3, labels)
  assert.deepEqual(a, orderFor(20261112, 3, labels))
  assert.deepEqual([...a].sort(), [...labels].sort())
  assert.notDeepEqual(orderFor(20261112, 3, labels), orderFor(20261112, 4, labels))
})
