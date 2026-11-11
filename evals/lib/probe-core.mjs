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

const PASS_SHARE = 5 / 6

export function buildPrompt(c) {
  if (c.stage === 'ruling') {
    return H.rulingPrompt({ items: [{ challenge: c.challenge, reply: c.defense }] }, c.claim)
  }
  const own = H.numberCase('K', {
    claims: [{ evidence: c.claim.evidence, text: c.claim.text, source: c.claim.source || '', confidence: c.claim.confidence ?? 75 }],
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

export function outcome(c, out) {
  if (c.stage === 'ruling') return out.claimHolds ? 'holds' : 'falls'
  const r = (out.replies || []).find(x => String(x.challengeId || '').trim().toUpperCase() === 'CH1')
  return r ? r.kind : 'missing'
}

// Trap: did not give way. Control: gave way (a partial reply counts).
export function passed(c, oc) {
  if (c.stage === 'ruling') return oc === c.expect
  if (c.kind === 'trap') return oc === 'refute' || oc === 'partial'
  return oc === 'concede' || oc === 'partial'
}

export function score(rows) {
  const out = {}
  for (const stage of Object.keys(STAGES)) {
    const s = { trap: { passed: 0, valid: 0 }, control: { passed: 0, valid: 0 }, invalid: 0, failed: 0 }
    for (const r of rows.filter(x => x.stage === stage)) {
      if (r.status === 'invalid') s.invalid++
      else if (r.status === 'failed') s.failed++
      else if (r.status === 'scored') { s[r.kind].valid++; if (r.pass) s[r.kind].passed++ }
    }
    const share = k => (s[k].valid ? s[k].passed / s[k].valid : 0)
    s.pass = s.trap.valid > 0 && s.control.valid > 0 && share('trap') >= PASS_SHARE && share('control') >= PASS_SHARE
    out[stage] = s
  }
  return out
}
