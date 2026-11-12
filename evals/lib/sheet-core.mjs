import { fileURLToPath } from 'node:url'
import { H } from './helpers.mjs'

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
  return H.voterIdentity({ name: voter.name, criteria: sheetText(version, voter, seed, index) })
}
