import { fileURLToPath } from 'node:url'
import { H } from './helpers.mjs'
import { stability, firstChoiceStats, mean, identityBefore } from './persona-core.mjs'

export const SHEETS_VOTERS_PATH = fileURLToPath(new URL('../sheet-voters-5lang.json', import.meta.url))
export const SHEET_VERSIONS = ['S0', 'S1', 'S2', 'S3', 'S4']

const cares = (items, ranked) => `Cares about (${ranked ? 'in order' : 'in no particular order'}): ${items.join(', ')}`
const limits = v => [`Accepts: ${v.accepts}`, `Rejects: ${v.rejects}`]

// S0 production; S1 unranked; S2 no Accepts or Rejects; S3 top 2 items; S4 all 5 items.
export function sheetText(version, voter, seed, index) {
  const c = voter.cares
  if (version === 'S0') return [cares(c.slice(0, 3), true), ...limits(voter)].join('\n')
  // A seeded shuffle, so the display order does not carry the rank.
  if (version === 'S1') return [cares(H.shuffle(c.slice(0, 3), H.makeRng(seed + 2000 + index)), false), ...limits(voter)].join('\n')
  if (version === 'S2') return cares(c.slice(0, 3), true)
  if (version === 'S3') return [cares(c.slice(0, 2), true), ...limits(voter)].join('\n')
  if (version === 'S4') return [cares(c, true), ...limits(voter)].join('\n')
  throw new Error(`unknown sheet version ${version}`)
}

// The judge's reference: all 5 ranked items with Accepts and Rejects.
export const referenceCriteria = voter => [cares(voter.cares, true), ...limits(voter)].join('\n')

// The reference lines each version's sheet shows, as judge labels.
export const OWN_LINES = {
  S0: new Set(['cares1', 'cares2', 'cares3', 'accepts', 'rejects']),
  S1: new Set(['cares1', 'cares2', 'cares3', 'accepts', 'rejects']),
  S2: new Set(['cares1', 'cares2', 'cares3']),
  S3: new Set(['cares1', 'cares2', 'accepts', 'rejects']),
  S4: new Set(['cares1', 'cares2', 'cares3', 'cares4', 'cares5', 'accepts', 'rejects']),
}

export function sheetIdentity(version, voter, seed, index) {
  return identityBefore({ name: voter.name, criteria: sheetText(version, voter, seed, index) })
}

// Adherence: reasons tied to the voter's own lines. Coverage: reasons tied to any reference line.
// Top-item weight: share of "Cares about" reasons that serve the voter's #1 item.
export function sheetMeasures(judgment, ballot, version) {
  const serves = new Map((judgment.reasons || []).map(r => [r.index, r.serves]))
  const got = ballot.reasons.map((_, i) => serves.get(i) || 'none')
  const n = got.length
  const caresTied = got.filter(l => /^cares\d$/.test(l))
  return {
    adherence: n ? got.filter(l => OWN_LINES[version].has(l)).length / n : 0,
    coverage: n ? got.filter(l => l !== 'none').length / n : 0,
    topWeight: caresTied.length ? caresTied.filter(l => l === 'cares1').length / caresTied.length : null,
    violations: (judgment.rejectsViolations || []).length,
  }
}

export function summarizeSheets(results, voters, versions = SHEET_VERSIONS) {
  const byVersion = {}
  const byVoter = []
  for (const version of versions) {
    const rs = results.filter(r => r.version === version)
    const valid = rs.filter(r => r.status === 'valid')
    const judged = valid.filter(r => r.measures)
    const pick = k => mean(judged.map(r => r.measures[k]).filter(x => x !== null))
    const cells = voters.map(voter => {
      const mine = valid.filter(r => r.voter === voter.name)
      const st = stability(mine.map(r => r.ranking))
      return { voter: voter.name, version, valid: mine.length, adherence: mean(mine.filter(r => r.measures).map(r => r.measures.adherence)), sameWinner: st.sameWinner, spread: st.spread }
    })
    byVoter.push(...cells)
    byVersion[version] = {
      valid: valid.length,
      invalid: rs.filter(r => r.status === 'invalid').length,
      missing: rs.filter(r => r.status === 'missing').length,
      adherence: pick('adherence'), coverage: pick('coverage'), topWeight: pick('topWeight'), violations: pick('violations'),
      sameWinner: mean(cells.filter(c => c.valid > 0).map(c => c.sameWinner)),
      spread: mean(cells.map(c => c.spread).filter(x => x !== null)),
      ...firstChoiceStats(valid.map(r => r.ranking)),
    }
  }
  return { byVersion, byVoter }
}

// Decision rule from the spec: the smallest gap from S0 that counts, per measure.
// spread was added after run 2026-11-12-sheets1 and applies from the next run.
export const BARS = { adherence: 0.10, coverage: 0.10, topWeight: 0.10, topFirstShare: 0.15, violations: 0.5, spread: 0.5 }

export function differences(byVersion, base = 'S0') {
  const out = []
  for (const version of Object.keys(byVersion)) {
    if (version === base) continue
    for (const [measure, bar] of Object.entries(BARS)) {
      const a = byVersion[version][measure]
      const b = byVersion[base][measure]
      if (a == null || b == null) continue
      const gap = a - b
      // Rounded to 3 places, so a gap of exactly the bar counts.
      if (Math.round(Math.abs(gap) * 1000) >= Math.round(bar * 1000)) out.push({ version, measure, gap })
    }
  }
  return out
}

const f2 = x => (x == null ? 'n/a' : x.toFixed(2))
const signed = x => `${x >= 0 ? '+' : '-'}${Math.abs(x).toFixed(2)}`

export function formatSheetReport(summary, run, failed = []) {
  const { byVersion, byVoter } = summary
  const versions = Object.keys(byVersion)
  const diffs = differences(byVersion)
  const lines = [
    `# Sheet test ${run.runId}`,
    '',
    `Script ${run.scriptCommit}. Spend $${(run.spent ?? 0).toFixed(2)} of $${Number(run.budgetUsd).toFixed(2)}.`,
    'S0 production sheet. S1 unranked. S2 no Accepts or Rejects. S3 top 2 items. S4 all 5 items.',
    '',
    '| Version | Valid | Invalid | Missing | Adherence | Coverage | Top-item weight | Rejects violations | Same winner | Ranking spread | Top first-choice share |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...versions.map(k => {
      const x = byVersion[k]
      return `| ${k} | ${x.valid} | ${x.invalid} | ${x.missing} | ${f2(x.adherence)} | ${f2(x.coverage)} | ${f2(x.topWeight)} | ${f2(x.violations)} | ${f2(x.sameWinner)} | ${f2(x.spread)} | ${f2(x.topFirstShare)} |`
    }),
    '',
    `Differences from S0 that pass their bar (adherence, coverage, top-item weight ${BARS.adherence.toFixed(2)}; top first-choice share ${BARS.topFirstShare.toFixed(2)}; rejects violations and ranking spread ${BARS.violations.toFixed(2)}):`,
    ...(diffs.length ? diffs.map(d => `- ${d.version}: ${d.measure} ${signed(d.gap)}`) : ['- none']),
    '',
    'Each version has at most 21 ballots, so only large effects show.',
    '',
    '| Voter | Version | Valid | Adherence | Same winner | Ranking spread |',
    '| --- | --- | --- | --- | --- | --- |',
    ...byVoter.map(c => `| ${c.voter} | ${c.version} | ${c.valid} | ${f2(c.adherence)} | ${c.sameWinner} | ${f2(c.spread)} |`),
  ]
  if (failed.length) lines.push('', 'Failed calls:', ...failed.map(r => `- ${r.key}${r.subtype ? ` (${r.subtype})` : ''}: ${r.error}`))
  return lines.join('\n')
}
