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
  for (const saved of d.flips) {
    const r = recomputed.find(x => x.label === saved.label)
    for (const k of ['conceded', 'adverse']) {
      if (r[k] !== saved[k]) bad.push(`Option ${saved.label} ${k}: saved ${saved[k]}, recomputed ${r[k]}`)
    }
    if (JSON.stringify(r.warnings) !== JSON.stringify(saved.warnings)) {
      bad.push(`Option ${saved.label} warnings: saved [${saved.warnings}], recomputed [${r.warnings}]`)
    }
  }
  return bad.length ? fail(bad) : pass(`${d.flips.length} options consistent`)
}
