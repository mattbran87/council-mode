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

// The production identity block before the priority lines were added (workflow commit c5e8fbd).
// The persona, sheet, and sheet v2 tests ran with it, so they keep it and stay reproducible.
export function identityBefore(persona) {
  return [`You are a voter on a decision panel. Your persona: ${persona.name}.`, 'Your criteria sheet:', persona.criteria].join('\n')
}

// v1: described persona; v2: the production block as tested (identityBefore); v3: criteria with no name.
export function identityFor(version, voter) {
  if (version === 'v1') return [`You are a voter on a decision panel. Your persona: ${voter.name}.`, 'About you:', voter.description].join('\n')
  if (version === 'v2') return identityBefore(voter)
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

export const JUDGE_MODEL = 'opus'
export const MIN_GAIN = 0.10

export const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    reasons: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          serves: { type: 'string', enum: ['cares1', 'cares2', 'cares3', 'cares4', 'cares5', 'accepts', 'rejects', 'none'] },
          note: { type: 'string' },
        },
        required: ['index', 'serves', 'note'],
      },
    },
    rejectsViolations: {
      type: 'array',
      items: {
        type: 'object',
        properties: { higher: { type: 'string' }, lower: { type: 'string' }, note: { type: 'string' } },
        required: ['higher', 'lower', 'note'],
      },
    },
  },
  required: ['reasons', 'rejectsViolations'],
}

// The judge sees the criteria and the ballot only: no voter name and no version, so it cannot favor one.
export function judgePrompt(voter, ballot, options) {
  const c = parseCriteria(voter.criteria)
  return [
    "You check whether a voter's ballot follows the voter's own criteria. Judge only the fit between the reasons and the criteria, not whether the ranking is right.",
    '',
    "The voter's criteria, most important first:",
    ...c.cares.map((x, i) => `cares${i + 1}: ${x}`),
    `accepts: ${c.accepts}`,
    `rejects: ${c.rejects}`,
    '',
    'The options:',
    ...options.map(o => `${o.label}: ${o.description}`),
    '',
    `The ballot's ranking, best first: ${ballot.ranking.join(', ')}`,
    "The ballot's reasons, one per adjacent pair:",
    ...ballot.reasons.map((r, i) => `${i}. ${r.higher} over ${r.lower}: ${r.reason}`),
    '',
    'Rules:',
    '- reasons: one entry per reason, by its number. serves: the one criterion the reason mainly argues from (cares1, cares2, …, accepts, or rejects), or none if it argues from something the criteria do not mention. note: a few words on why.',
    '- rejectsViolations: each adjacent pair where the higher option has what the rejects line rules out and the lower option does not. An empty list if there are none.',
  ].join('\n')
}

export function ballotMeasures(judgment, ballot) {
  const serves = new Map((judgment.reasons || []).map(r => [r.index, r.serves]))
  const n = ballot.reasons.length
  const tied = ballot.reasons.filter((_, i) => (serves.get(i) || 'none') !== 'none').length
  return {
    tiedShare: n ? tied / n : 0,
    topUsed: ballot.reasons.some((_, i) => serves.get(i) === 'cares1'),
    violations: (judgment.rejectsViolations || []).length,
  }
}

// Kendall distance: option pairs that the 2 rankings put in a different order.
export function kendall(a, b) {
  const pos = new Map(b.map((x, i) => [x, i]))
  const items = a.filter(x => pos.has(x))
  let d = 0
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) if (pos.get(items[i]) > pos.get(items[j])) d++
  }
  return d
}

export function stability(rankings) {
  if (!rankings.length) return { sameWinner: 0, spread: null }
  const counts = new Map()
  for (const r of rankings) counts.set(r[0], (counts.get(r[0]) || 0) + 1)
  const pairs = []
  for (let i = 0; i < rankings.length; i++) {
    for (let j = i + 1; j < rankings.length; j++) pairs.push(kendall(rankings[i], rankings[j]))
  }
  return { sameWinner: Math.max(...counts.values()), spread: pairs.length ? pairs.reduce((s, x) => s + x, 0) / pairs.length : null }
}

export const mean = xs => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)

// Panel diversity: how the first choices of valid ballots spread across options.
export function firstChoiceStats(rankings) {
  const firstChoices = {}
  for (const r of rankings) firstChoices[r[0]] = (firstChoices[r[0]] || 0) + 1
  const counts = Object.values(firstChoices)
  const total = counts.reduce((s, x) => s + x, 0)
  return { firstChoices, distinctFirst: counts.length, topFirstShare: total ? Math.max(...counts) / total : null }
}

// results: [{ voter, version, attempt, status: 'valid'|'invalid'|'missing', ranking?, measures? }]
// A valid ballot with no measures (its judge call failed) counts for stability, not faithfulness.
export function summarize(results, voters, versions = VERSIONS) {
  const byVersion = {}
  const byVoter = []
  for (const version of versions) {
    const rs = results.filter(r => r.version === version)
    const judged = rs.filter(r => r.measures)
    const cells = voters.map(voter => {
      const mine = rs.filter(r => r.voter === voter.name)
      const st = stability(mine.filter(r => r.status === 'valid').map(r => r.ranking))
      return {
        voter: voter.name, version,
        valid: mine.filter(r => r.status === 'valid').length,
        tiedShare: mean(mine.filter(r => r.measures).map(r => r.measures.tiedShare)),
        sameWinner: st.sameWinner, spread: st.spread,
      }
    })
    byVoter.push(...cells)
    byVersion[version] = {
      ...firstChoiceStats(rs.filter(x => x.status === 'valid').map(x => x.ranking)),
      valid: rs.filter(r => r.status === 'valid').length,
      invalid: rs.filter(r => r.status === 'invalid').length,
      missing: rs.filter(r => r.status === 'missing').length,
      tiedShare: mean(judged.map(r => r.measures.tiedShare)),
      topUsed: mean(judged.map(r => (r.measures.topUsed ? 1 : 0))),
      violations: mean(judged.map(r => r.measures.violations)),
      sameWinner: mean(cells.filter(c => c.valid > 0).map(c => c.sameWinner)),
      spread: mean(cells.map(c => c.spread).filter(x => x !== null)),
    }
  }
  return { byVersion, byVoter }
}

// Decision rule from the spec: A beats B when A's tied share is at least MIN_GAIN higher and A's spread is not higher.
export function verdicts(byVersion, versions = VERSIONS) {
  const out = []
  for (const a of versions) {
    for (const b of versions) {
      const A = byVersion[a]
      const B = byVersion[b]
      if (a === b || A.tiedShare == null || B.tiedShare == null) continue
      // Rounded to 3 places, so 0.70 - 0.60 counts as a gain of 0.10.
      const gain = Math.round((A.tiedShare - B.tiedShare) * 1000) >= Math.round(MIN_GAIN * 1000)
      const steady = A.spread == null || B.spread == null || A.spread <= B.spread
      if (gain && steady) out.push(`${a} beats ${b}`)
    }
  }
  return out
}

const f2 = x => (x == null ? 'n/a' : x.toFixed(2))

export function formatPersonaReport(summary, run, failed = []) {
  const { byVersion, byVoter } = summary
  const versions = Object.keys(byVersion)
  const v = verdicts(byVersion, versions)
  const lines = [
    `# Persona test ${run.runId}`,
    '',
    `Script ${run.scriptCommit}. Spend $${(run.spent ?? 0).toFixed(2)} of $${Number(run.budgetUsd).toFixed(2)}.`,
    'v1: name + description. v2: name + criteria (production). v3: criteria only.',
    '',
    '| Version | Valid | Invalid | Missing | Tied share | Top criterion used | Rejects violations | Same winner | Ranking spread |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...versions.map(k => {
      const x = byVersion[k]
      return `| ${k} | ${x.valid} | ${x.invalid} | ${x.missing} | ${f2(x.tiedShare)} | ${f2(x.topUsed)} | ${f2(x.violations)} | ${f2(x.sameWinner)} | ${f2(x.spread)} |`
    }),
    '',
    `Verdicts (tied share at least ${MIN_GAIN.toFixed(2)} higher and spread not higher): ${v.length ? v.join('; ') : 'none'}.`,
    'Each version has at most 21 ballots, so only large differences show.',
    '',
    'Panel diversity: first choices across valid ballots. A top share near 1 means the panel herds onto one option.',
    '',
    '| Version | Distinct first choices | Top first-choice share | First choices |',
    '| --- | --- | --- | --- |',
    ...versions.map(k => {
      const x = byVersion[k]
      const list = Object.entries(x.firstChoices || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([l, n]) => `${l} ${n}`).join(', ')
      return `| ${k} | ${x.distinctFirst ?? 0} | ${f2(x.topFirstShare)} | ${list || 'none'} |`
    }),
    '',
    '| Voter | Version | Valid | Tied share | Same winner | Ranking spread |',
    '| --- | --- | --- | --- | --- | --- |',
    ...byVoter.map(c => `| ${c.voter} | ${c.version} | ${c.valid} | ${f2(c.tiedShare)} | ${c.sameWinner} | ${f2(c.spread)} |`),
  ]
  if (failed.length) lines.push('', 'Failed calls:', ...failed.map(r => `- ${r.key}${r.subtype ? ` (${r.subtype})` : ''}: ${r.error}`))
  return lines.join('\n')
}

// Turns the run's rows into one result per planned ballot: valid (with measures when judged), invalid, or missing.
// measure(judgment, ballot, version) turns a judge reply into the measures for one ballot.
export function evaluate(rows, voters, versions, repeats, labels, ids, measure = (j, b) => ballotMeasures(j, b)) {
  const ok = rows.filter(r => r.status === 'ok')
  const find = (step, cell) => ok.find(r => r.step === step && r.cell === cell)
  const out = []
  voters.forEach((voter, i) => {
    for (const version of versions) {
      for (let attempt = 1; attempt <= repeats; attempt++) {
        const cell = `${i}:${version}#${attempt}`
        const base = { voter: voter.name, version, attempt }
        const vote = find('vote', cell)
        if (!vote) { out.push({ ...base, status: 'missing' }); continue }
        const ballot = H.normalizeBallot(vote.output, labels, ids)
        if (!H.validateBallot(ballot, labels, ids).valid) { out.push({ ...base, status: 'invalid' }); continue }
        const judge = find('judge', cell)
        out.push({ ...base, status: 'valid', ranking: ballot.ranking, measures: judge ? measure(judge.output, ballot, version) : null })
      }
    }
  })
  return out
}
