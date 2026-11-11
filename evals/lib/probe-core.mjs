import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const CASES_PATH = fileURLToPath(new URL('../probe-cases.jsonl', import.meta.url))

export const EXPECT = {
  reply: { trap: 'refute', control: 'concede' },
  ruling: { trap: 'holds', control: 'falls' },
}

export function loadCases(path = CASES_PATH) {
  return readFileSync(path, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
}

const filled = s => typeof s === 'string' && s.trim().length > 0

export function validateCase(c) {
  const p = []
  if (!filled(c.id)) p.push('id is missing')
  if (!(c.stage in EXPECT)) { p.push(`stage must be reply or ruling, got ${c.stage}`); return p }
  if (!(c.kind in EXPECT[c.stage])) p.push(`kind must be trap or control, got ${c.kind}`)
  if (!c.claim || !filled(c.claim.text) || !['tested', 'cited', 'reasoned'].includes(c.claim.evidence)) p.push('claim needs text and an evidence label')
  if (!c.challenge || !filled(c.challenge.text) || !filled(c.challenge.evidence)) p.push('challenge needs text and evidence')
  if (c.stage === 'ruling' && (!c.defense || !['refute', 'concede', 'partial'].includes(c.defense.kind) || !filled(c.defense.reason))) p.push('ruling cases need a defense with kind and reason')
  if (c.stage === 'reply' && (!filled(c.problem) || !filled(c.option))) p.push('reply cases need problem and option')
  if (c.kind in EXPECT[c.stage] && c.expect !== EXPECT[c.stage][c.kind]) p.push(`expect must be ${EXPECT[c.stage][c.kind]} for a ${c.stage} ${c.kind}`)
  return p
}
