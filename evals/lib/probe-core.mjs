import { H } from './helpers.mjs'
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

export const STAGES = {
  reply: { model: 'sonnet', schema: H.REPLY_SCHEMA },
  ruling: { model: 'opus', schema: H.RULING_SCHEMA },
}

// A stage needs at least 5 of every 6 planned runs of each kind to be valid, and 5 of 6 of the valid runs to pass.
const minOf = n => Math.ceil((5 * n) / 6)

export const DEFAULT_START_CONFIDENCE = 75
export const startConfidence = c => c.claim.confidence ?? DEFAULT_START_CONFIDENCE

export function planFor(cases, repeats) {
  const plan = {}
  for (const stage of Object.keys(STAGES)) plan[stage] = { trap: 0, control: 0 }
  for (const c of cases) if (plan[c.stage] && c.kind in plan[c.stage]) plan[c.stage][c.kind] += repeats
  return plan
}

export function buildPrompt(c) {
  if (c.stage === 'ruling') {
    return H.rulingPrompt({ items: [{ challenge: c.challenge, reply: c.defense }] }, c.claim)
  }
  const own = H.numberCase('K', {
    claims: [{ evidence: c.claim.evidence, text: c.claim.text, source: c.claim.source || '', confidence: startConfidence(c) }],
    weaknesses: [],
    failedTests: [],
  })
  return H.replyPrompt(c.problem, own, [{ id: 'CH1', targetClaim: 'K-C1', text: c.challenge.text, evidence: c.challenge.evidence }], c.option)
}

const isStr = v => typeof v === 'string'

export function checkShape(stage, out) {
  if (!out || typeof out !== 'object') return false
  if (stage === 'ruling') return typeof out.claimHolds === 'boolean' && isStr(out.checked) && isStr(out.note)
  return Array.isArray(out.replies) && out.replies.every(r =>
    r && isStr(r.challengeId) && ['refute', 'concede', 'partial'].includes(r.kind) &&
    isStr(r.evidence) && Number.isInteger(r.newConfidence) && isStr(r.dropReason) && isStr(r.reason))
}

const ch1 = out => (out.replies || []).find(x => String(x.challengeId || '').trim().toUpperCase() === 'CH1')

// The confidence the reply gives the claim after CH1, or null when there is none.
export function newConfidence(out) {
  const r = out && ch1(out)
  return r && Number.isInteger(r.newConfidence) ? r.newConfidence : null
}

export function outcome(c, out) {
  if (c.stage === 'ruling') return out.claimHolds ? 'holds' : 'falls'
  const r = ch1(out)
  return r ? r.kind : 'missing'
}

// Trap: did not give way. Control: gave way (a partial reply counts).
export function passed(c, oc) {
  if (c.stage === 'ruling') return oc === c.expect
  if (c.kind === 'trap') return oc === 'refute' || oc === 'partial'
  return oc === 'concede' || oc === 'partial'
}

export function score(rows, plan) {
  const out = {}
  for (const stage of Object.keys(STAGES)) {
    const s = { trap: { passed: 0, valid: 0 }, control: { passed: 0, valid: 0 }, invalid: 0, failed: 0 }
    for (const r of rows.filter(x => x.stage === stage)) {
      if (r.status === 'invalid') s.invalid++
      else if (r.status === 'failed') s.failed++
      else if (r.status === 'scored') { s[r.kind].valid++; if (r.pass) s[r.kind].passed++ }
    }
    const planned = plan[stage]
    const enough = k => s[k].valid >= minOf(planned[k])
    const holds = k => s[k].valid > 0 && s[k].passed * 6 >= s[k].valid * 5
    const complete = s.failed === 0 && s.invalid === 0 && s.trap.valid >= planned.trap && s.control.valid >= planned.control
    s.planned = planned
    if (!enough('trap') || !enough('control')) { s.result = 'incomplete'; s.confidence = 'Low' }
    else {
      s.result = holds('trap') && holds('control') ? 'PASS' : 'FAIL'
      s.confidence = complete ? 'High' : 'Medium'
    }
    out[stage] = s
  }
  return out
}
