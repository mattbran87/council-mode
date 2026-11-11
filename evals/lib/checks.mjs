import { H } from './helpers.mjs'

export const pass = detail => ({ status: 'PASS', detail })
export const fail = problems => ({ status: 'FAIL', detail: [].concat(problems).join('; ') })
export const warn = detail => ({ status: 'WARN', detail })
export const na = detail => ({ status: 'n/a', detail })

const labelsOf = run => run.options.map(o => o.label)

export function checkBallots(fx) {
  const run = fx.run
  if (!run.ballots || !run.dossier) return na('stopped run')
  const ids = H.dossierIds(run.dossier)
  const labels = labelsOf(run)
  const bad = []
  for (const b of run.ballots) {
    const v = H.validateBallot(b, labels, ids)
    if (!v.valid) bad.push(`${b.persona}: ${v.problems.join(', ')}`)
    for (const r of b.reasons || []) {
      for (const id of r.cites || []) if (!ids.has(id)) bad.push(`${b.persona}: cites ${id}, which is not in the dossier`)
    }
  }
  return bad.length ? fail(bad) : pass(`${run.ballots.length} ballots valid`)
}

export function checkTally(fx) {
  const run = fx.run
  if (!run.result || !run.ballots) return na('stopped run')
  const t = H.tally(labelsOf(run), run.ballots)
  const keys = ['method', 'winner', 'tied', 'pairwise', 'borda', 'fragile', 'unacceptableVotes']
  if ('voters' in run.result) keys.push('voters')
  const diff = keys.filter(k => JSON.stringify(t[k]) !== JSON.stringify(run.result[k]))
  return diff.length
    ? fail(diff.map(k => `${k}: saved ${JSON.stringify(run.result[k])}, recomputed ${JSON.stringify(t[k])}`))
    : pass(`${run.result.method}, winner ${run.result.winner}`)
}

export function checkFlips(fx) {
  const d = fx.run.dossier
  if (!d) return na('stopped run')
  // The dossier does not store disputed challenges, so `challenged` comes from the saved flips.
  const challenges = d.flips.flatMap(f => Array.from({ length: f.challenged }, () => ({ against: f.label })))
  const recomputed = H.flipStats(labelsOf(fx.run), challenges, { concessions: d.concessions, voided: d.voided }, d.rulings, fx.meta.thresholds)
  const bad = []
  const savedLabels = new Set(d.flips.map(f => f.label))
  for (const r of recomputed) if (!savedLabels.has(r.label)) bad.push(`Option ${r.label}: missing from saved flips`)
  for (const saved of d.flips) {
    const r = recomputed.find(x => x.label === saved.label)
    if (!r) { bad.push(`Option ${saved.label}: in saved flips but not an option`); continue }
    for (const k of ['conceded', 'adverse']) {
      if (r[k] !== saved[k]) bad.push(`Option ${saved.label} ${k}: saved ${saved[k]}, recomputed ${r[k]}`)
    }
    if (JSON.stringify(r.warnings) !== JSON.stringify(saved.warnings)) {
      bad.push(`Option ${saved.label} warnings: saved [${saved.warnings}], recomputed [${r.warnings}]`)
    }
  }
  return bad.length ? fail(bad) : pass(`${d.flips.length} options consistent`)
}

// Check 4. `h` lets tests inject a faulty renderer.
export function checkDossier(fx, h = H) {
  const d = fx.run.dossier
  if (!d) return na('stopped run')
  const bad = []
  const falseClaims = new Set(d.rulings.filter(r => !r.claimHolds).map(r => r.claim))
  const conceded = new Set(d.concessions.map(x => x.challenge.targetClaim))
  for (const o of d.options) {
    for (const c of o.claims) {
      const want = falseClaims.has(c.id) ? 'struck' : conceded.has(c.id) ? 'conceded' : 'stands'
      if (c.status !== want) bad.push(`${c.id}: status ${c.status}, expected ${want}`)
    }
  }
  // A copy with every model-written string flattened must render to the same number of lines.
  const flat = JSON.parse(JSON.stringify(d), (k, v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ') : v))
  flat.problem = d.problem // the user writes the problem; it may span lines
  const order = labelsOf(fx.run)
  const real = h.renderDossier(d, order).split('\n').length
  const flattened = h.renderDossier(flat, order).split('\n').length
  if (real !== flattened) bad.push(`rendered dossier has ${real} lines, ${real - flattened} more than with model text flattened`)
  return bad.length ? fail(bad) : pass(`${d.options.flatMap(o => o.claims).length} claim statuses consistent; no forged lines`)
}

const CLAIM_ID = /\b[A-Z]-[CW]\d+\b/
const OPTION_MENTION = /\bOption [A-Z]\b/

// Check 5. `h` lets tests inject a leaky builder.
export function checkBlindness(fx, h = H) {
  const d = fx.run.dossier
  if (!d) return na('stopped run')
  const claims = new Map(d.options.flatMap(o => o.claims.map(c => [c.id, c])))
  const fails = []
  const hints = []
  const placeholder = { challenge: { text: 'placeholder challenge', evidence: 'placeholder evidence' }, reply: { kind: 'refute', reason: 'placeholder defense', evidence: 'placeholder evidence' } }
  for (const r of d.rulings) {
    const claim = claims.get(r.claim)
    if (!claim) { fails.push(`${r.id}: claim ${r.claim} is not in the dossier`); continue }
    const prompt = h.rulingPrompt({ items: [placeholder] }, claim)
    const leak = prompt.match(CLAIM_ID)
    if (leak) fails.push(`${r.id}: ruling prompt contains claim ID ${leak[0]}`)
    if (new RegExp(`\\b${r.id}\\b`).test(prompt)) fails.push(`${r.id}: ruling prompt contains its ruling ID`)
    const mention = `${claim.text} ${claim.source || ''}`.match(OPTION_MENTION)
    if (mention) hints.push(`${r.claim} text names ${mention[0]}`)
  }
  for (const x of [...d.concessions, ...d.unanswered]) {
    const mention = `${x.challenge.text} ${x.challenge.evidence}`.match(OPTION_MENTION)
    if (mention) hints.push(`challenge against ${x.challenge.targetClaim} names ${mention[0]}`)
  }
  if (fails.length) return fail(fails)
  if (hints.length) return warn(`model text names options: ${hints.join('; ')}`)
  return pass(`${d.rulings.length} ruling prompts blind`)
}

// Check 6.
export function checkCost(fx) {
  const run = fx.run
  if (run.stopped || !run.dossier) return na('stopped run')
  const N = run.options.length
  const R = run.dossier.rulings.length
  const expected = (fx.meta.fixedOptions ? 8 : 12) + 3 * N + R
  const got = fx.top.agentCount
  const detail = `${got} agents (formula ${expected}), ${fx.top.totalTokens} tokens`
  return got > expected ? warn(detail) : pass(detail)
}

export const CHECKS = [
  { name: 'ballots', fn: checkBallots },
  { name: 'tally', fn: checkTally },
  { name: 'flips', fn: checkFlips },
  { name: 'dossier', fn: checkDossier },
  { name: 'blindness', fn: checkBlindness },
  { name: 'cost', fn: checkCost },
]

export function runChecks(fx) {
  return CHECKS.map(({ name, fn }) => {
    try { return { name, ...fn(fx) } } catch (e) { return { name, status: 'ERROR', detail: e.message } }
  })
}
