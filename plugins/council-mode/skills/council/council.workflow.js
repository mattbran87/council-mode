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
function rewriteMap(rewrites) {
  const byId = {}
  for (const r of rewrites || []) {
    if (!r || typeof r !== 'object') continue
    const id = String(r.id || '').trim().toUpperCase()
    const text = String(r.text ?? '').trim()
    if (id && text && !byId[id]) byId[id] = text
  }
  return byId
}

function applyRewrites(challenges, rewrites) {
  const byId = rewriteMap(rewrites)
  return challenges.map(c => (byId[c.id] ? { ...c, text: byId[c.id] } : c))
}

// Challenges that keep their original wording because the referee gave no usable rewrite.
function unrewrittenIds(challenges, rewrites) {
  const byId = rewriteMap(rewrites)
  return challenges.filter(c => !byId[c.id]).map(c => c.id)
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
    if (typeof reply.newConfidence === 'number' && reply.newConfidence < claim.confidence && !String(reply.dropReason || '').trim()) {
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

// Models write "Option K", "k" or "[R1]." — normalize before validating, so only real defects void a ballot.
function normalizeBallot(ballot, labels, ids) {
  const label = x => String(x ?? '').trim().replace(/^option\s+/i, '').trim().toUpperCase()
  const cites = list => {
    const out = []
    for (const c of list || []) {
      for (const m of String(c ?? '').toUpperCase().matchAll(/\b([A-Z]-[CW]\d+|[RXU]\d+)\b/g)) {
        if (ids.has(m[1]) && !out.includes(m[1])) out.push(m[1])
      }
    }
    return out
  }
  return {
    ...ballot,
    ranking: (ballot.ranking || []).map(label),
    reasons: (ballot.reasons || []).map(r => ({ ...r, higher: label(r.higher), lower: label(r.lower), cites: cites(r.cites) })),
    unacceptable: (ballot.unacceptable || []).map(label).filter(l => labels.includes(l)),
  }
}

// A reason without a valid dossier ID is probably stereotype voting, so it voids the ballot.
function validateBallot(ballot, labels, ids) {
  const problems = []
  const ranking = ballot.ranking || []
  const full = ranking.length === labels.length &&
    new Set(ranking).size === labels.length &&
    ranking.every(l => labels.includes(l))
  if (!full) return { valid: false, problems: [`ranking [${ranking.join(', ')}] is not a full ranking of ${labels.join(', ')}`] }
  for (let i = 0; i < ranking.length - 1; i++) {
    const higher = ranking[i]
    const lower = ranking[i + 1]
    const reason = (ballot.reasons || []).find(r => r.higher === higher && r.lower === lower)
    if (!reason) {
      const reversed = (ballot.reasons || []).some(r => r.higher === lower && r.lower === higher)
      problems.push(reversed ? `reason for ${higher} over ${lower} is reversed` : `no reason for ${higher} over ${lower}`)
      continue
    }
    if (!(reason.cites || []).some(id => ids.has(id))) problems.push(`reason for ${higher} over ${lower} cites no dossier ID`)
  }
  return { valid: problems.length === 0, problems }
}

function citationCounts(ballots, ids) {
  const counts = {}
  for (const b of ballots) {
    const seen = new Set()
    const ranking = b.ranking || []
    for (const r of b.reasons || []) {
      const i = ranking.indexOf(r.higher)
      if (i < 0 || ranking[i + 1] !== r.lower) continue
      for (const id of r.cites || []) if (ids.has(id)) seen.add(id)
    }
    for (const id of seen) counts[id] = (counts[id] || 0) + 1
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([id, voters]) => ({ id, voters }))
}

function pairwiseTable(labels, rankings) {
  const m = {}
  for (const a of labels) {
    m[a] = {}
    for (const b of labels) m[a][b] = 0
  }
  for (const r of rankings) {
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) m[r[i]][r[j]]++
  }
  return m
}

function condorcetWinner(labels, m) {
  return labels.find(a => labels.every(b => a === b || m[a][b] > m[b][a])) || null
}

// Last place = 0 points, each place up = 1 more point.
function bordaScores(labels, rankings) {
  const scores = {}
  for (const l of labels) scores[l] = 0
  for (const r of rankings) r.forEach((l, i) => { scores[l] += r.length - 1 - i })
  return scores
}

// Instant runoff is not used: with few voters it drops a compromise every voter ranks second.
function tally(labels, ballots) {
  const rankings = ballots.map(b => b.ranking)
  const pairwise = pairwiseTable(labels, rankings)
  const borda = bordaScores(labels, rankings)
  let method
  let winner = condorcetWinner(labels, pairwise)
  let tied = []
  if (winner) {
    method = 'condorcet'
  } else {
    const top = Math.max(...labels.map(l => borda[l]))
    tied = labels.filter(l => borda[l] === top)
    if (tied.length === 1) {
      method = 'borda'
      winner = tied[0]
      tied = []
    } else {
      method = 'tie'
      winner = null
    }
  }
  const unacceptableVotes = winner ? ballots.filter(b => (b.unacceptable || []).includes(winner)).length : 0
  return { method, winner, tied, pairwise, borda, fragile: unacceptableVotes >= 2, unacceptableVotes, voters: rankings.length }
}

const DESCRIPTION_ITEM = { type: 'object', properties: { description: { type: 'string' } }, required: ['description'] }

const GENERATOR_SCHEMA = {
  type: 'object',
  properties: { options: { type: 'array', minItems: 2, maxItems: 4, items: DESCRIPTION_ITEM } },
  required: ['options'],
}

const MERGE_SCHEMA = {
  type: 'object',
  properties: { options: { type: 'array', items: DESCRIPTION_ITEM }, baseline: { type: 'string' } },
  required: ['options', 'baseline'],
}

const CASE_SCHEMA = {
  type: 'object',
  properties: {
    claims: {
      type: 'array', minItems: 1, maxItems: 8,
      items: {
        type: 'object',
        properties: {
          evidence: { type: 'string', enum: ['tested', 'cited', 'reasoned'] },
          text: { type: 'string' },
          source: { type: 'string' },
          confidence: { type: 'integer', minimum: 0, maximum: 100 },
        },
        required: ['evidence', 'text', 'confidence'],
      },
    },
    weaknesses: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'string' } },
    failedTests: { type: 'array', items: { type: 'string' } },
  },
  required: ['claims', 'weaknesses', 'failedTests'],
}

const CHALLENGE_SCHEMA = {
  type: 'object',
  properties: {
    challenges: {
      type: 'array',
      items: {
        type: 'object',
        properties: { targetClaim: { type: 'string' }, text: { type: 'string' }, evidence: { type: 'string' } },
        required: ['targetClaim', 'text', 'evidence'],
      },
    },
  },
  required: ['challenges'],
}

const REWRITE_SCHEMA = {
  type: 'object',
  properties: {
    challenges: {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' } }, required: ['id', 'text'] },
    },
  },
  required: ['challenges'],
}

const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    replies: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          challengeId: { type: 'string' },
          kind: { type: 'string', enum: ['refute', 'concede', 'partial'] },
          evidence: { type: 'string' },
          newConfidence: { type: 'integer', minimum: 0, maximum: 100 },
          dropReason: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['challengeId', 'kind', 'evidence', 'newConfidence', 'dropReason', 'reason'],
      },
    },
  },
  required: ['replies'],
}

const RULING_SCHEMA = {
  type: 'object',
  properties: { claimHolds: { type: 'boolean' }, checked: { type: 'string' }, note: { type: 'string' } },
  required: ['claimHolds', 'checked', 'note'],
}

const BALLOT_SCHEMA = {
  type: 'object',
  properties: {
    ranking: { type: 'array', items: { type: 'string' } },
    reasons: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          higher: { type: 'string' },
          lower: { type: 'string' },
          reason: { type: 'string' },
          cites: { type: 'array', items: { type: 'string' } },
        },
        required: ['higher', 'lower', 'reason', 'cites'],
      },
    },
    flipCondition: { type: 'string' },
    unacceptable: { type: 'array', items: { type: 'string' } },
    hybrid: { type: 'string' },
  },
  required: ['ranking', 'reasons', 'flipCondition', 'unacceptable', 'hybrid'],
}

function cleanOpts(opts) {
  const out = {}
  for (const key of Object.keys(opts)) {
    const v = opts[key]
    if (v !== undefined && v !== null && v !== '') out[key] = v
  }
  return out
}

function renderCase(c, description) {
  const lines = [`Option ${c.label}: ${oneLine(description)}`]
  for (const cl of c.claims) {
    lines.push(`- ${cl.id} [${cl.evidence}] ${oneLine(cl.text)}${cl.source ? ` (${oneLine(cl.source)})` : ''}; confidence ${cl.confidence}`)
  }
  for (const w of c.weaknesses) lines.push(`- ${w.id} weakness: ${oneLine(w.text)}`)
  lines.push(`- Failed tests: ${c.failedTests.length ? c.failedTests.map(oneLine).join('; ') : 'none'}`)
  return lines.join('\n')
}

function generatorPrompt(problem, n) {
  return [
    `You are option generator ${n} of 3. The other generators work independently; you cannot see them.`,
    'Problem statement (frozen; do not reinterpret it):',
    problem,
    '',
    'Propose 2 to 4 options that differ in approach, not only in detail.',
    'Describe each in one neutral paragraph of at most 80 words: what it is and how it works.',
    'Do not argue for an option, and do not give it a name that sells it.',
  ].join('\n')
}

function mergePrompt(problem, candidates) {
  return [
    'Merge these candidate options for one decision into a deduplicated list.',
    'Problem statement:',
    problem,
    '',
    'Candidates:',
    ...candidates.map((o, i) => `${i + 1}. ${oneLine(o.description)}`),
    '',
    'Combine options that differ only in detail. Keep options that differ in approach.',
    'Write each merged option as one neutral paragraph of at most 80 words, with no name that sells it.',
    'Also write a baseline option in the baseline field: "change nothing", or the simplest thing that meets the problem statement. Do not put the baseline in the options list.',
  ].join('\n')
}

function advocatePrompt(problem, option, budget) {
  return [
    `You are the advocate for Option ${option.label}. Build the strongest honest case for it.`,
    'Problem statement (frozen):',
    problem,
    '',
    `Option ${option.label}: ${oneLine(option.description)}`,
    option.baseline ? 'This is the baseline option. Argue for it as seriously as any other option.' : '',
    '',
    `Research budget: ${budget}. Every advocate gets the same budget.`,
    'Rules:',
    '- Give at most 8 claims, each under 40 words.',
    '- Label each claim by evidence: tested (you ran it; put the result or log path in source), cited (a source states it; put the link in source), or reasoned (argument only).',
    '- Give each claim a confidence score from 0 to 100.',
    '- Report exactly your 2 strongest weaknesses.',
    '- Report every failed test. A hidden failed test is a rule violation.',
  ].join('\n')
}

function challengePrompt(problem, own, rivals, options) {
  const describe = label => options.find(o => o.label === label).description
  return [
    `You are the advocate for Option ${own.label}. This is debate round 1: challenge your rivals' claims.`,
    'Problem statement (frozen):',
    problem,
    '',
    'Your case:',
    renderCase(own, describe(own.label)),
    '',
    'Rival cases:',
    ...rivals.map(r => `${renderCase(r, describe(r.label))}\n`),
    'Rules:',
    '- Challenge at most 2 claims of each rival, by claim ID (for example M-C2).',
    '- Every challenge must state its evidence in full: a test result, a source with its link, or a quoted fact. A bare claim ID is not evidence, and do not name your own option. A challenge without evidence is rejected.',
    '- State each challenge plainly. Do not use words such as "clearly" or "obviously".',
    '- If no rival claim is weak, return an empty list.',
  ].join('\n')
}

function refereeFilterPrompt(challenges) {
  return [
    'You are a neutral referee. Rewrite each debate challenge below into neutral form.',
    'Keep the exact factual content. Delete confidence and tone words such as "clearly", "obviously", and "any expert knows", and any appeal to authority.',
    'Remove any reference to which option wrote the challenge, such as "our option" or the challenger\'s own claim IDs.',
    'Return every challenge by its ID. Do not add, drop, or merge challenges. Do not rewrite the evidence.',
    '',
    ...challenges.map(c => `${c.id} (against ${c.targetClaim}): ${oneLine(c.text)} | Evidence: ${oneLine(c.evidence)}`),
  ].join('\n')
}

function replyPrompt(problem, own, against, description) {
  return [
    `You are the advocate for Option ${own.label}. This is debate round 2: reply to every challenge against your claims.`,
    'Problem statement (frozen):',
    problem,
    '',
    'Your case:',
    renderCase(own, description),
    '',
    'Challenges (the authors are hidden):',
    ...against.map(c => `${c.id} against ${c.targetClaim}: ${oneLine(c.text)} | Evidence: ${oneLine(c.evidence)}`),
    '',
    'Rules:',
    '- Reply to every challenge by its ID. A challenge with no reply is shown to the voters as unanswered.',
    '- kind: refute (give the evidence that defeats the challenge), concede (give the evidence that defeats your own claim), or partial (give the evidence for the part that stands).',
    '- Concede only for evidence. Confident wording is not evidence. A concession without evidence is voided.',
    '- newConfidence: your confidence in the challenged claim now. dropReason: if newConfidence is lower than before, the evidence that caused the drop; otherwise an empty string.',
  ].join('\n')
}

// Blind: the referee sees the claim text, never its ID or option label.
function rulingPrompt(dispute, claim) {
  return [
    'You are a neutral referee. Rule whether one disputed claim holds. You do not know which option the claim supports.',
    `Claim [${claim.evidence}]: ${oneLine(claim.text)}${claim.source ? ` (source: ${oneLine(claim.source)})` : ''}`,
    `Challenge: ${oneLine(dispute.challenge.text)}`,
    `Challenge evidence: ${oneLine(dispute.challenge.evidence)}`,
    `Defense (${dispute.reply.kind}): ${oneLine(dispute.reply.reason)}`,
    `Defense evidence: ${oneLine(dispute.reply.evidence) || 'none given'}`,
    '',
    'Check the evidence yourself where you can: re-run the test or read the source.',
    'claimHolds: true only if the claim survives the challenge. checked: what you checked. note: one sentence on why.',
  ].join('\n')
}

function votePrompt(persona, dossierText, order) {
  return [
    `You are a voter on a decision panel. Your persona: ${persona.name}.`,
    'Your criteria sheet:',
    persona.criteria,
    '',
    'Rank every option by your criteria, using only the dossier below. The debate authors are hidden.',
    '',
    dossierText,
    '',
    'Ballot rules:',
    `- ranking: every option label, best first. Labels: ${order.join(', ')}.`,
    '- reasons: one entry for each adjacent pair in your ranking (higher over lower). cites: the dossier IDs the reason rests on, such as claim IDs (K-C1), weakness IDs (K-W1), rulings (R1), concessions (X1), or unanswered challenges (U1). A reason that cites no dossier ID voids your ballot.',
    '- flipCondition: "my ranking changes if ...".',
    '- unacceptable: labels of options you would reject outright, or an empty list.',
    '- hybrid: a combination of options you would prefer, or an empty string.',
  ].join('\n')
}

// --- pure helpers end

const A = args || {}
const personas = A.personas || []
if (!A.problem || personas.length !== 7) throw new Error('council-mode needs args.problem and exactly 7 args.personas')
if (!A.refereeModel) throw new Error('council-mode needs args.refereeModel')
if (A.advocateModel && A.refereeModel === A.advocateModel) {
  throw new Error('args.refereeModel must differ from args.advocateModel, so the referee does not judge its own model')
}
const personaNames = new Set()
for (const p of personas) {
  if (personaNames.has(p.name)) throw new Error(`duplicate persona name: ${p.name}`)
  personaNames.add(p.name)
}
const seed = Number.isInteger(Number(A.seed)) ? Number(A.seed) : 1
const budgetText = A.budget || 'at most 20 tool calls'
const warnings = []
const describeOf = o => (typeof o === 'string' ? o : o && o.description)

// Step 2: generate, or take fixed options for a hybrid round.
let described
if (A.options) {
  described = { options: A.options, baseline: describeOf(A.baseline) || 'Change nothing.' }
} else {
  phase('Generate')
  const generated = (await parallel([1, 2, 3].map(n => () =>
    agent(generatorPrompt(A.problem, n), { label: `generate:${n}`, phase: 'Generate', schema: GENERATOR_SCHEMA }))))
    .filter(g => g && Array.isArray(g.options))
  if (!generated.length) return { stopped: 'every option generator failed; resume the run to retry it' }
  described = await agent(mergePrompt(A.problem, generated.flatMap(g => g.options)),
    { label: 'merge', phase: 'Generate', schema: MERGE_SCHEMA })
  if (!described || !Array.isArray(described.options)) return { stopped: 'the merge agent failed; resume the run to retry it' }
}
if (described.options.length + 1 > LABEL_LETTERS.length) {
  return { stopped: `too many options after the merge (${described.options.length}); narrow the problem statement` }
}
const options = assignLabels([
  ...described.options.map(o => ({ description: describeOf(o), baseline: false })),
  { description: described.baseline, baseline: true },
], makeRng(seed))
if (described.options.length < 3) {
  log(`Only ${described.options.length} distinct options after the merge; stopping before research.`)
  return { stopped: 'fewer than 3 distinct options after the merge; the problem does not need a council', options }
}
const describe = label => options.find(o => o.label === label).description

// Step 3: research. Barrier: round 1 needs every case.
phase('Research')
const rawCases = await parallel(options.map(o => () =>
  agent(advocatePrompt(A.problem, o, budgetText), cleanOpts({
    label: `advocate:${o.label}`, phase: 'Research', schema: CASE_SCHEMA,
    model: A.advocateModel, isolation: A.isolateAdvocates ? 'worktree' : undefined,
  }))))
const cases = []
for (let i = 0; i < options.length; i++) {
  if (!rawCases[i]) return { stopped: `the advocate for Option ${options[i].label} failed; resume the run to retry it`, options }
  cases.push(numberCase(options[i].label, rawCases[i]))
}
const claimIndex = indexClaims(cases)

// Step 4, round 1: every advocate challenges at the same time.
phase('Challenge')
const round1 = await parallel(cases.map(c => () =>
  agent(challengePrompt(A.problem, c, cases.filter(k => k.label !== c.label), options), cleanOpts({
    label: `challenge:${c.label}`, phase: 'Challenge', schema: CHALLENGE_SCHEMA, model: A.advocateModel,
  })).then(r => ({ from: c.label, challenges: r && Array.isArray(r.challenges) ? r.challenges : null }))))
for (let i = 0; i < cases.length; i++) {
  if (!round1[i] || !round1[i].challenges) {
    return { stopped: `the challenge agent for Option ${cases[i].label} failed; resume the run to retry it`, options }
  }
}
const { accepted, rejected } = collectChallenges(round1, claimIndex)
if (rejected.length) log(`Referee rejected ${rejected.length} challenges before delivery.`)

phase('Referee')
let challenges = accepted
if (accepted.length) {
  const rewrite = await agent(refereeFilterPrompt(accepted), cleanOpts({
    label: 'referee:filter', phase: 'Referee', schema: REWRITE_SCHEMA, model: A.refereeModel,
  }))
  if (!rewrite || !Array.isArray(rewrite.challenges)) return { stopped: 'the referee filter failed; resume the run to retry it', options }
  challenges = applyRewrites(accepted, rewrite.challenges)
  const missing = unrewrittenIds(accepted, rewrite.challenges)
  if (missing.length) {
    const w = `referee did not rewrite ${missing.join(', ')}; original wording kept`
    log(w)
    warnings.push(w)
  }
}

// Step 4, round 2: every advocate replies at the same time.
phase('Reply')
const replyLists = await parallel(cases.map(c => () => {
  const against = challenges.filter(ch => ch.against === c.label)
  if (!against.length) return Promise.resolve({ replies: [] })
  return agent(replyPrompt(A.problem, c, against, describe(c.label)), cleanOpts({
    label: `reply:${c.label}`, phase: 'Reply', schema: REPLY_SCHEMA, model: A.advocateModel,
  }))
}))
for (let i = 0; i < cases.length; i++) {
  const challenged = challenges.some(ch => ch.against === cases[i].label)
  if (challenged && (!replyLists[i] || !Array.isArray(replyLists[i].replies))) {
    return { stopped: `the reply agent for Option ${cases[i].label} failed; resume the run to retry it`, options }
  }
}
// Each advocate's replies stay tagged with its label, so a stray ID cannot answer a rival's challenge.
const replyRounds = cases.map((c, i) => ({ from: c.label, replies: replyLists[i].replies }))
const classified = classifyReplies(challenges, replyRounds, claimIndex)
if (classified.stray.length) {
  const w = `${classified.stray.length} replies named a challenge that was not against their option; ignored`
  log(w)
  warnings.push(w)
}
if (classified.duplicates.length) {
  const w = `${classified.duplicates.length} duplicate replies ignored; the first reply counts`
  log(w)
  warnings.push(w)
}

// Blind rulings on every disputed claim. Every ruling is binding, so a missing one stops the run.
phase('Rule')
const rulingResults = await parallel(classified.disputes.map(d => () =>
  agent(rulingPrompt(d, claimIndex[d.challenge.targetClaim]), cleanOpts({
    label: `ruling:${d.id}`, phase: 'Rule', schema: RULING_SCHEMA, model: A.refereeModel,
  }))))
const rulings = []
for (let i = 0; i < classified.disputes.length; i++) {
  const d = classified.disputes[i]
  const r = rulingResults[i]
  if (!r || typeof r.claimHolds !== 'boolean') return { stopped: `the ruling for ${d.id} failed; resume the run to retry it`, options }
  rulings.push({
    id: d.id, claim: d.challenge.targetClaim, against: d.challenge.against,
    claimHolds: r.claimHolds, checked: r.checked, note: r.note,
  })
}

// Step 5: dossier.
const labels = options.map(o => o.label)
const flips = flipStats(labels, challenges, classified, rulings, A.thresholds)
const dossier = buildDossier({ problem: A.problem, options, cases, classified, rulings, flips })
const ids = dossierIds(dossier)

// Step 6: vote, each voter with its own option order.
phase('Vote')
const ballots = await parallel(personas.map((p, i) => () => {
  const order = shuffle(labels, makeRng(seed + 1000 + i))
  return agent(votePrompt(p, renderDossier(dossier, order), order), cleanOpts({
    label: `vote:${p.name}`, phase: 'Vote', schema: BALLOT_SCHEMA, model: p.model,
  })).then(b => b && { ...b, persona: p.name, model: p.model, order })
}))
const valid = []
const discarded = []
ballots.forEach((b, i) => {
  if (!b) { discarded.push({ persona: personas[i].name, problems: ['the voter agent failed'] }); return }
  // Normalize "Option K", "k", "k-c1" first, so a format slip does not void a ballot that cites evidence.
  const nb = normalizeBallot(b, labels, ids)
  const check = validateBallot(nb, labels, ids)
  if (check.valid) valid.push(nb)
  else discarded.push({ persona: nb.persona, problems: check.problems })
})
if (discarded.length) log(`${discarded.length} ballots discarded.`)
if (!valid.length) {
  return { stopped: 'every ballot was discarded, so there is no vote to tally', options, dossier, rejectedChallenges: rejected, discarded, warnings }
}

// Step 7: tally.
return {
  options,
  dossier,
  rejectedChallenges: rejected,
  result: tally(labels, valid),
  citations: citationCounts(valid, ids),
  ballots: valid.map(b => ({
    persona: b.persona, model: b.model, ranking: b.ranking, reasons: b.reasons,
    flipCondition: b.flipCondition, unacceptable: b.unacceptable || [], hybrid: b.hybrid || '',
  })),
  discarded,
  warnings,
}
