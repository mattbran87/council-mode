export const meta = {
  name: 'council-mode',
  description: 'Advocates argue each option with evidence, debate under a blind referee, and a 7-persona panel ranks the options',
  whenToUse: 'Only from the council-mode:council skill, after the user approves the problem statement and the panel',
  phases: [
    { title: 'Generate', detail: 'parallel option generators, then one merge' },
    { title: 'Research', detail: 'one advocate per option builds an evidence-labeled case' },
    { title: 'Challenge', detail: 'round 1: every advocate challenges its rivals at the same time' },
    { title: 'Referee', detail: 'reject challenges without evidence, strip the tone' },
    { title: 'Reply', detail: 'round 2: every advocate answers every challenge at the same time' },
    { title: 'Rule', detail: 'blind referee rulings on disputed claims' },
    { title: 'Vote', detail: 'the frozen panel ranks the options from the dossier' },
  ],
}

// --- pure helpers start
const LABEL_LETTERS = ['B', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'S', 'T', 'V', 'Y', 'Z']
// mulberry32: Workflow scripts cannot call Math.random, so randomness comes from args.seed.
function makeRng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle(items, rng) {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

function assignLabels(options, rng) {
  if (options.length > LABEL_LETTERS.length) throw new Error(`too many options: ${options.length}`)
  const letters = shuffle(LABEL_LETTERS, rng)
  return options.map((o, i) => ({ ...o, label: letters[i] }))
}

const DEFAULT_THRESHOLDS = { sycophancy: 0.75 }
const MAX_CHALLENGES_PER_RIVAL = 2

function numberCase(label, raw) {
  return {
    label,
    claims: raw.claims.map((c, i) => ({
      id: `${label}-C${i + 1}`,
      evidence: c.evidence,
      text: c.text,
      source: c.source || '',
      confidence: c.confidence,
    })),
    weaknesses: raw.weaknesses.map((w, i) => ({ id: `${label}-W${i + 1}`, text: w })),
    failedTests: raw.failedTests || [],
  }
}

function indexClaims(cases) {
  const index = {}
  for (const c of cases) for (const claim of c.claims) index[claim.id] = { ...claim, label: c.label }
  return index
}

// Rule 1: a challenge without evidence never reaches the advocate.
function collectChallenges(rounds, claimIndex) {
  const accepted = []
  const rejected = []
  const perRival = {}
  for (const round of rounds) {
    for (const c of round.challenges || []) {
      const target = String(c.targetClaim || '').trim().toUpperCase()
      const base = { from: round.from, targetClaim: target, text: c.text, evidence: String(c.evidence || '').trim() }
      const claim = claimIndex[target]
      if (!claim) { rejected.push({ ...base, why: 'unknown claim' }); continue }
      if (claim.label === round.from) { rejected.push({ ...base, why: 'own claim' }); continue }
      if (!base.evidence) { rejected.push({ ...base, why: 'no evidence' }); continue }
      const key = `${round.from}>${claim.label}`
      perRival[key] = (perRival[key] || 0) + 1
      if (perRival[key] > MAX_CHALLENGES_PER_RIVAL) { rejected.push({ ...base, why: 'over limit' }); continue }
      accepted.push({ ...base, id: `CH${accepted.length + 1}`, against: claim.label })
    }
  }
  return { accepted, rejected }
}

// Rule 3: the referee's neutral rewrite replaces the text; the evidence is never rewritten.
function applyRewrites(challenges, rewrites) {
  const byId = {}
  for (const r of rewrites || []) byId[r.id] = r.text
  return challenges.map(c => {
    const text = byId[c.id]
    return text && text.trim() ? { ...c, text } : c
  })
}

// Rules 2, 5, and 6: concessions need evidence, drops need evidence, silence is recorded.
function classifyReplies(challenges, replyRounds, claimIndex) {
  const byId = {}
  for (const ch of challenges) byId[ch.id] = ch
  const replyFor = {}
  const out = { concessions: [], voided: [], disputes: [], unanswered: [], drops: [], stray: [], duplicates: [] }
  for (const round of replyRounds || []) {
    for (const reply of round.replies || []) {
      if (!reply || typeof reply !== 'object') { out.stray.push({ from: round.from, challengeId: '' }); continue }
      const replyId = String(reply.challengeId || '').trim().toUpperCase()
      const ch = byId[replyId]
      if (!ch || ch.against !== round.from) { out.stray.push({ from: round.from, challengeId: replyId }); continue }
      if (replyFor[ch.id]) { out.duplicates.push({ from: round.from, challengeId: replyId }); continue }
      replyFor[ch.id] = reply
    }
  }
  for (const ch of challenges) {
    const reply = replyFor[ch.id]
    if (!reply) {
      out.unanswered.push({ id: `U${out.unanswered.length + 1}`, challenge: ch })
      continue
    }
    const evidence = String(reply.evidence || '').trim()
    const claim = claimIndex[ch.targetClaim]
    if (typeof reply.newConfidence === 'number' && reply.newConfidence < claim.confidence && !evidence) {
      out.drops.push({ claim: ch.targetClaim, from: claim.confidence, to: reply.newConfidence })
    }
    if (reply.kind === 'concede') {
      if (evidence) out.concessions.push({ id: `X${out.concessions.length + 1}`, challenge: ch, evidence })
      else out.voided.push({ challenge: ch, reason: reply.reason || '' })
    } else {
      out.disputes.push({ id: `R${out.disputes.length + 1}`, challenge: ch, reply: { ...reply, evidence } })
    }
  }
  return out
}

// Voided concessions count as concessions here: they show the same give-way behavior.
function flipStats(labels, challenges, classified, rulings, thresholds) {
  const t = { sycophancy: typeof (thresholds || {}).sycophancy === 'number' ? thresholds.sycophancy : DEFAULT_THRESHOLDS.sycophancy }
  return labels.map(label => {
    const challenged = challenges.filter(c => c.against === label).length
    const conceded =
      classified.concessions.filter(x => x.challenge.against === label).length +
      classified.voided.filter(x => x.challenge.against === label).length
    const adverse = rulings.filter(r => r.against === label && !r.claimHolds).length
    const warnings = []
    if (challenged > 0 && conceded / challenged >= t.sycophancy) warnings.push('sycophancy')
    if (conceded === 0 && adverse >= 1) warnings.push('stubbornness')
    return { label, challenged, conceded, adverse, warnings }
  })
}

function buildDossier({ problem, options, cases, classified, rulings, flips }) {
  const struck = new Set(rulings.filter(r => !r.claimHolds).map(r => r.claim))
  const conceded = new Set(classified.concessions.map(x => x.challenge.targetClaim))
  return {
    problem,
    options: options.map(o => {
      const c = cases.find(k => k.label === o.label)
      return {
        label: o.label,
        description: o.description,
        claims: c.claims.map(cl => ({
          ...cl,
          status: struck.has(cl.id) ? 'struck' : conceded.has(cl.id) ? 'conceded' : 'stands',
        })),
        weaknesses: c.weaknesses,
        failedTests: c.failedTests,
      }
    }),
    rulings,
    concessions: classified.concessions,
    voided: classified.voided,
    unanswered: classified.unanswered,
    drops: classified.drops,
    flips,
  }
}

// IDs a ballot reason may cite. A bare option label is not evidence, so it is not in the set.
function dossierIds(dossier) {
  const ids = new Set()
  for (const o of dossier.options) {
    for (const c of o.claims) ids.add(c.id)
    for (const w of o.weaknesses) ids.add(w.id)
  }
  for (const r of dossier.rulings) ids.add(r.id)
  for (const x of dossier.concessions) ids.add(x.id)
  for (const u of dossier.unanswered) ids.add(u.id)
  return ids
}

function oneLine(s) { return String(s ?? '').replace(/\s+/g, ' ').trim() }

function section(title, items) {
  return [title, ...(items.length ? items : ['- none']), '']
}

// Order entries by the position of the owning option (label = part of the claim ID before the first '-'). Stable.
function byOrder(order, items, claimOf) {
  const rank = x => {
    const i = order.indexOf(String(claimOf(x)).split('-')[0])
    return i < 0 ? order.length : i
  }
  return items.map((x, i) => [x, i]).sort((p, q) => rank(p[0]) - rank(q[0]) || p[1] - q[1]).map(p => p[0])
}

function renderDossier(dossier, order) {
  const lines = ['## Problem', dossier.problem, '']
  for (const label of order) {
    const o = dossier.options.find(x => x.label === label)
    lines.push(`### Option ${o.label}`, oneLine(o.description), '')
    for (const c of o.claims) {
      lines.push(`- ${c.id} [${c.evidence}] ${oneLine(c.text)}${c.source ? ` (${oneLine(c.source)})` : ''}; confidence ${c.confidence}; ${c.status}`)
    }
    for (const w of o.weaknesses) lines.push(`- ${w.id} weakness: ${oneLine(w.text)}`)
    lines.push(`- Failed tests: ${o.failedTests.length ? o.failedTests.map(oneLine).join('; ') : 'none'}`, '')
  }
  lines.push(...section('## Referee rulings', byOrder(order, dossier.rulings, r => r.claim).map(r =>
    `- ${r.id} on ${r.claim}: ${r.claimHolds ? 'claim holds' : 'claim false'}. Checked: ${oneLine(r.checked)}. ${oneLine(r.note)}`)))
  lines.push(...section('## Concessions', byOrder(order, dossier.concessions, x => x.challenge.targetClaim).map(x =>
    `- ${x.id} ${x.challenge.targetClaim} conceded. Evidence: ${oneLine(x.evidence)}`)))
  lines.push(...section('## Voided concessions (no evidence given, so the claim stands)',
    byOrder(order, dossier.voided, v => v.challenge.targetClaim).map(v => `- ${v.challenge.targetClaim}`)))
  lines.push(...section('## Unanswered challenges', byOrder(order, dossier.unanswered, u => u.challenge.targetClaim).map(u =>
    `- ${u.id} against ${u.challenge.targetClaim}: ${oneLine(u.challenge.text)} (evidence: ${oneLine(u.challenge.evidence)})`)))
  lines.push(...section('## Unexplained confidence drops', byOrder(order, dossier.drops, d => d.claim).map(d =>
    `- ${d.claim}: ${d.from} to ${d.to}, no evidence given`)))
  lines.push(...section('## Flip counts', order.map(label => {
    const f = dossier.flips.find(x => x.label === label)
    const warn = f.warnings.length ? `; warning: ${f.warnings.join(', ')}` : ''
    return `- Option ${f.label}: conceded ${f.conceded} of ${f.challenged} challenges; ${f.adverse} adverse rulings${warn}`
  })))
  return lines.join('\n')
}

// --- pure helpers end

return { stopped: 'orchestration not implemented yet' }
