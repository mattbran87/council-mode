# Council Mode persona test: Design Spec

2026-11-12 · Matthew Brandenburg

## Question

Does the voter's identity block change how well a ballot follows the voter's stated priorities? Studies of persona prompts report small or inconsistent gains, and the multi-lens-research skill already uses short preference statements with no identity. Council Mode's voters get a persona name plus a criteria sheet. This test compares 3 identity blocks on the same dossier:

| Version | Identity block |
| --- | --- |
| v1, described persona | Name plus a 1–2 sentence description of the person. No stated priorities. |
| v2, today's prompt | Name plus criteria sheet. |
| v3, criteria only | Criteria sheet with no name. |

Only the identity block changes. The dossier, the ballot rules, the schema, the model, and the option order stay the same.

## Measures

- **Faithfulness:** the ballot's reasons serve the voter's own criteria.
- **Stability:** the same voter gives the same ranking across repeats.

Panel diversity and evidence quality are out of scope for this test.

## Scope

In scope: a pilot on the original scenario, using the saved dossier of `evals/fixtures/2026-11-11-cli-language/`.

Out of scope:
- The 7-language follow-up scenario (Python, Rust, C#, C++, Go, Ruby, JavaScript). It runs only if the pilot cannot separate the versions, for example when the C# options win under every version. It needs its own council run and a decision on the 5-option cap.
- Any change to how the council builds its panel.

## Approach

A voter stage in the existing eval harness. It reuses `evals/lib/helpers.mjs`, `evals/lib/claude.mjs`, and `evals/lib/runstore.mjs`, and the production `renderDossier`, `votePrompt`, `BALLOT_SCHEMA`, `validateBallot`, `dossierIds`, `makeRng`, and `shuffle`.

## Production change

`votePrompt` gets its identity block from a separate helper, `voterIdentity(persona)`, so the eval can swap the block. For today's input, the output text must not change: a test pins the full prompt for one persona, byte for byte, against the text before the change.

Today's identity block (v2):

```
You are a voter on a decision panel. Your persona: <name>.
Your criteria sheet:
<criteria>
```

v1 replaces the last 2 lines with `About you:` and the description. v3 drops `Your persona: <name>.` and keeps the criteria sheet.

## Voters

`evals/persona-voters.json` holds the 7 stakeholders from the first run: name, model, criteria sheet (word for word from that run's arguments), and the description below. The user approved these descriptions on 2026-11-12.

| Name | Model | Description (v1) |
| --- | --- | --- |
| Field-data coordinator | haiku | Runs inspection uploads from a Windows 11 laptop between site visits. Not a developer; uses the tool a few times a day on small files. |
| Team developer (maintainer) | sonnet | One of the 4 developers on the GIS team. Writes and fixes the team's internal tools, and gets the call when one breaks. |
| Future new hire | sonnet | A developer who joins the team in 2 years and inherits this tool with no handover from its authors. |
| Nightly-job owner (Linux build agents) | opus | Runs the 2 Linux build agents that call the tool up to 500 times a night, and gets paged when the nightly window is missed. |
| Desktop IT and security | haiku | Manages the locked-down Windows 11 laptop fleet and approves what software may run on it. |
| GIS data steward (feature service owner) | opus | Owns the ArcGIS Enterprise feature service the tool uploads into, and answers for the quality of its data. |
| Team lead (5-year owner) | sonnet | Leads the 4-person team, owns its budget and hiring, and will own this tool for the next 5 years. |

## A run

1. **Order.** Each voter gets one option order from the production `shuffle` with `makeRng(seed + voter index)`. The seed is stored in `persona-voters.json`. The order is the same for all versions and repeats of that voter.
2. **Voter calls.** 7 voters × 3 versions × 3 repeats = 63 calls. Each runs on the voter's model, in safe mode, with no tools, with `BALLOT_SCHEMA` as the JSON schema. The production voters vote from the dossier alone, so the test gives them no tools either.
3. **Validity.** Each ballot goes through `normalizeBallot` and `validateBallot` against the option labels and `dossierIds(dossier)`. An invalid ballot is counted and shown, never judged or scored. A failed call leaves the ballot missing.
4. **Judge calls.** One call per valid ballot, on opus, in safe mode, with no tools. The judge gets the voter's criteria sheet, with each "Cares about" item numbered, and the ballot. It never sees the version, and the prompt does not mention versions. For each reason, it names the criterion the reason serves: `cares1`, `cares2`, `cares3`, `accepts`, `rejects`, or `none`. It also lists each adjacent pair where the higher option breaks the voter's "Rejects" line and the lower one does not.

Voter calls run before judge calls. Rerunning the same run id resumes both.

## Scoring

Per ballot:
- **Tied share:** reasons the judge tied to a criterion, divided by all reasons.
- **Top criterion used:** at least one reason serves `cares1`.
- **Rejects violations:** the number of flagged pairs.

Per voter and version (3 repeats):
- **Same winner:** how many repeats pick the most common first choice (3, 2, or 1).
- **Ranking spread:** the mean, over the 3 pairs of repeats, of option pairs in a different order (the Kendall distance).

Per version: the means of the above over its ballots and voters, plus the counts of invalid and missing ballots.

**Decision rule, set before the run.** Version A beats version B only when:
- A's mean tied share is at least 0.10 higher than B's, and
- A's mean ranking spread is not higher than B's.

Each version has at most 21 ballots, so this pilot can show only large differences. The report states this.

## Report

- A table of versions × measures.
- One row per voter and version, so the stakeholders that change most stand out.
- The pairwise verdicts under the decision rule.
- Spend, invalid and missing ballots, and failed calls with their error subtype.

## Run handling

The same as the probe:
- a run folder `~/.claude/council-mode-evals/<run-id>/` with `rows.jsonl` and `run.json` (script label, budget, repeats, plan)
- a dollar cap with a default of $10
- resume by run id
- a stop after 3 failed calls in a row
- the error subtype on a failed row

Row keys carry the script label, so a change to `votePrompt` reruns the voters.

The rendered dossier is about 56,500 characters, roughly 14,000 tokens, and goes into every voter call. The cost per call is not measured yet.

## Layout

| Path | Contents |
| --- | --- |
| `evals/persona.mjs` | CLI: `node evals/persona.mjs --run-id <id> [--budget-usd 10] [--repeats 3]`, and `runPersonaTest` |
| `evals/persona-voters.json` | Seed and the 7 voters |
| `evals/lib/persona-core.mjs` | Identity blocks, judge prompt and schema, the measures, the decision rule, the report text |
| `tests/evals-persona.test.mjs` | Offline tests |

## Testing

All tests run offline with a fake runner and a temp run folder. They cover:
- `votePrompt` output unchanged for today's input, pinned byte for byte
- v1 holds no criteria text, v3 holds no persona name, and only the identity block differs between versions
- the judge prompt never mentions a version
- the measures on hand-made ballots: tied share, top criterion, Kendall distance, same winner
- the decision rule
- budget stop, resume, and the 3-failure stop
- an invalid ballot is never judged

## Findings

After the run, write `evals/FINDINGS-<date>-personas.md`: the score table, what was right, what was wrong, and whether the 7-language follow-up is needed.
