import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { H } from './helpers.mjs'

export const VOTERS_PATH = fileURLToPath(new URL('../persona-voters.json', import.meta.url))
export const VERSIONS = ['v1', 'v2', 'v3']

// The hash goes into row keys, so an edit to a description or criteria sheet reruns the voters.
export function loadVoters(path = VOTERS_PATH) {
  const text = readFileSync(path, 'utf8')
  return { ...JSON.parse(text), hash: createHash('sha256').update(text).digest('hex').slice(0, 8) }
}

// "Cares about (in order): a, b, c" / "Accepts: …" / "Rejects: …"
export function parseCriteria(criteria) {
  const line = key => (criteria.split(/\r?\n/).find(l => l.trim().toLowerCase().startsWith(key)) || '').replace(/^[^:]*:\s*/, '').trim()
  return {
    cares: line('cares about').split(',').map(s => s.trim()).filter(Boolean),
    accepts: line('accepts'),
    rejects: line('rejects'),
  }
}

// v1: described persona; v2: today's production block; v3: criteria with no name.
export function identityFor(version, voter) {
  if (version === 'v1') return [`You are a voter on a decision panel. Your persona: ${voter.name}.`, 'About you:', voter.description].join('\n')
  if (version === 'v2') return H.voterIdentity(voter)
  if (version === 'v3') return ['You are a voter on a decision panel.', 'Your criteria sheet:', voter.criteria].join('\n')
  throw new Error(`unknown version ${version}`)
}

export function votePromptFor(version, voter, dossierText, order) {
  return H.votePrompt(voter, dossierText, order, identityFor(version, voter))
}

// The same seed offset the workflow uses for voter i.
export function orderFor(seed, index, labels) {
  return H.shuffle(labels, H.makeRng(seed + 1000 + index))
}
