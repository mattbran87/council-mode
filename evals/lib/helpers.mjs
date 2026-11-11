// The production helpers from the workflow script, so every check and probe uses the code the plugin runs.
import { loadHelpers } from '../../tests/harness.mjs'

export const H = loadHelpers(
  'validateBallot', 'dossierIds', 'tally', 'flipStats', 'renderDossier',
  'rulingPrompt', 'replyPrompt', 'numberCase', 'REPLY_SCHEMA', 'RULING_SCHEMA',
)
