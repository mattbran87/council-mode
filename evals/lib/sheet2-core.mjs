import { fileURLToPath } from 'node:url'
import { H } from './helpers.mjs'

export const SHEETS2_VOTERS_PATH = fileURLToPath(new URL('../sheet-voters-5lang-v2.json', import.meta.url))
export const SHEET2_VERSIONS = ['V0', 'V1', 'V2', 'V3', 'V4']

// V0 production; V1 + definitions; V2 + priority instruction; V3 + assessment first; V4 all 3.
const DEFINED = new Set(['V1', 'V4'])
const PRIORITIZED = new Set(['V2', 'V4'])
export const ASSESSED = new Set(['V3', 'V4'])

export const PRIORITY_LINES = [
  'Weigh your items in order: item 1 counts more than item 2, and item 2 more than item 3.',
  'Give up what your Accepts line names before you give up any item.',
  'Rank an option that has what your Rejects line names below the options that do not.',
]

export const ASSESSMENT_RULE = '- assessment: write this first. For each option, one note on how it serves or fails your items, citing dossier IDs. Then rank.'
const RULES_HEAD = '\nBallot rules:\n'

export function sheet2Text(version, voter) {
  if (!SHEET2_VERSIONS.includes(version)) throw new Error(`unknown sheet v2 version ${version}`)
  const items = DEFINED.has(version)
    ? ['Cares about (in order):', ...voter.cares.flatMap((c, i) => [`${i + 1}. ${c.item}`, `   Serves it: ${c.serves}`, `   Fails it: ${c.fails}`])]
    : [`Cares about (in order): ${voter.cares.map(c => c.item).join(', ')}`]
  return [...items, `Accepts: ${voter.accepts}`, `Rejects: ${voter.rejects}`].join('\n')
}

export function sheet2Identity(version, voter) {
  const id = H.voterIdentity({ name: voter.name, criteria: sheet2Text(version, voter) })
  return PRIORITIZED.has(version) ? [id, ...PRIORITY_LINES].join('\n') : id
}

export function sheet2VotePrompt(version, voter, dossierText, order) {
  const prompt = H.votePrompt(voter, dossierText, order, sheet2Identity(version, voter))
  if (!ASSESSED.has(version)) return prompt
  // The last match, so dossier text can never move the rule.
  const at = prompt.lastIndexOf(RULES_HEAD)
  if (at < 0) throw new Error('vote prompt has no "Ballot rules:" line')
  const end = at + RULES_HEAD.length
  return `${prompt.slice(0, end)}${ASSESSMENT_RULE}\n${prompt.slice(end)}`
}

// The production ballot with an assessment listed first, so the model writes it before the ranking.
export const BALLOT2_SCHEMA = {
  type: 'object',
  properties: {
    assessment: {
      type: 'array',
      items: { type: 'object', properties: { option: { type: 'string' }, note: { type: 'string' } }, required: ['option', 'note'] },
    },
    ...H.BALLOT_SCHEMA.properties,
  },
  required: ['assessment', ...H.BALLOT_SCHEMA.required],
}

export const voteSchema2 = version => (ASSESSED.has(version) ? BALLOT2_SCHEMA : H.BALLOT_SCHEMA)

// The production judge prompt's frame and rules, with each item's serves and fails lines.
// Every version is judged against this one reference, and the judge never sees the version or the voter's name.
export function judge2Prompt(voter, ballot, options) {
  return [
    "You check whether a voter's ballot follows the voter's own criteria. Judge only the fit between the reasons and the criteria, not whether the ranking is right.",
    '',
    "The voter's criteria, most important first, each with what serves it and what fails it:",
    ...voter.cares.flatMap((c, i) => [`cares${i + 1}: ${c.item}`, `  serves it: ${c.serves}`, `  fails it: ${c.fails}`]),
    `accepts: ${voter.accepts}`,
    `rejects: ${voter.rejects}`,
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
