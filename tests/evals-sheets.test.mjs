import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadVoters, parseCriteria } from '../evals/lib/persona-core.mjs'
import { SHEET_VERSIONS, SHEETS_VOTERS_PATH, sheetText, referenceCriteria, OWN_LINES, sheetIdentity } from '../evals/lib/sheet-core.mjs'

const voters = loadVoters(SHEETS_VOTERS_PATH)
const rel = voters.voters.find(v => v.name === 'Release engineer')
const relIndex = voters.voters.indexOf(rel)

test('every sheet voter has 5 ranked items, Accepts, and Rejects, and the reference parses back to them', () => {
  assert.equal(voters.voters.length, 7)
  for (const v of voters.voters) {
    assert.equal(v.cares.length, 5, v.name)
    assert.ok(v.accepts && v.rejects, v.name)
    const c = parseCriteria(referenceCriteria(v))
    assert.deepEqual(c.cares, v.cares, v.name)
  }
})

test('the 5 variants show the lines the spec lists', () => {
  const s = version => sheetText(version, rel, voters.seed, relIndex)
  assert.equal(s('S0'), 'Cares about (in order): reproducible builds for 3 OSes from one CI, code signing on macOS and Windows, small artifacts\nAccepts: longer CI builds\nRejects: per-OS build machines kept by hand')
  assert.match(s('S1'), /^Cares about \(in no particular order\): /)
  assert.deepEqual(parseCriteria(s('S1')).cares.slice().sort(), rel.cares.slice(0, 3).sort())
  assert.equal(s('S1'), sheetText('S1', rel, voters.seed, relIndex))
  assert.equal(s('S2'), 'Cares about (in order): reproducible builds for 3 OSes from one CI, code signing on macOS and Windows, small artifacts')
  assert.deepEqual(parseCriteria(s('S3')).cares, rel.cares.slice(0, 2))
  assert.deepEqual(parseCriteria(s('S4')).cares, rel.cares)
  assert.equal(s('S4'), referenceCriteria(rel))
  assert.throws(() => sheetText('S9', rel, voters.seed, relIndex))
})

test('the S1 shuffle changes the order for at least one voter', () => {
  const moved = voters.voters.some((v, i) => parseCriteria(sheetText('S1', v, voters.seed, i)).cares.join() !== v.cares.slice(0, 3).join())
  assert.ok(moved)
})

test('each version lists the reference lines its sheet shows', () => {
  assert.deepEqual([...OWN_LINES.S0].sort(), ['accepts', 'cares1', 'cares2', 'cares3', 'rejects'])
  assert.deepEqual([...OWN_LINES.S1].sort(), [...OWN_LINES.S0].sort())
  assert.deepEqual([...OWN_LINES.S2].sort(), ['cares1', 'cares2', 'cares3'])
  assert.deepEqual([...OWN_LINES.S3].sort(), ['accepts', 'cares1', 'cares2', 'rejects'])
  assert.equal(OWN_LINES.S4.size, 7)
  assert.deepEqual(SHEET_VERSIONS, ['S0', 'S1', 'S2', 'S3', 'S4'])
})

test('the identity block is the production one with the variant sheet', () => {
  const id = sheetIdentity('S2', rel, voters.seed, relIndex)
  assert.equal(id, `You are a voter on a decision panel. Your persona: ${rel.name}.\nYour criteria sheet:\n${sheetText('S2', rel, voters.seed, relIndex)}`)
})
