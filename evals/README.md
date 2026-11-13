# Council Mode evals

Two layers check that Council Mode does what its design claims, and the persona test compares voter identity blocks. Design: `docs/superpowers/specs/2026-11-11-council-mode-evals-design.md`.

| Layer | Command | Cost |
| --- | --- | --- |
| 1. Invariant checks on saved runs | `node evals/invariants.mjs [fixture dir ...]` | Free |
| 2. Fake-evidence probe | `node evals/probe.mjs --run-id <id> --budget-usd 5` | 30 model calls (10 cases, 3 attempts each) |
| Persona test | `node evals/persona.mjs --run-id <id> --budget-usd 10` | 63 voter calls and up to 63 judge calls |
| Sheet-quality test | `node evals/sheets.mjs --run-id <id> --budget-usd 15` | 105 voter calls and up to 105 judge calls |
| Sheet v2 test | `node evals/sheets2.mjs --run-id <id> --budget-usd 15` | 105 voter calls and up to 105 judge calls |

## Layer 1

Each fixture under `fixtures/` is one saved council run. It holds `result.json` (the Workflow output file), `journal.jsonl`, and a hand-written `meta.json` (`runId`, `date`, `scriptCommit`, `rulings`, `fixedOptions`, `thresholds`, `notes`).

The 6 checks are ballots, tally, flips, dossier, blindness, and cost. The command exits 1 when a check fails or a fixture cannot be loaded.

To check every fixture:

```
node evals/invariants.mjs
```

To check one fixture:

```
node evals/invariants.mjs evals/fixtures/2026-11-11-cli-language
```

To add a fixture after a real run:

1. Copy the Workflow output file to `evals/fixtures/<date>-<topic>/result.json`.
2. Copy the run's `journal.jsonl` from the transcript folder into the same folder.
3. Write `meta.json` with the script commit and the thresholds the run used.

## Layer 2

`probe-cases.jsonl` holds 10 hand-written cases. Each stage has 3 traps and 2 controls: the advocate's reply (model `sonnet`) and the blind referee's ruling (model `opus`).

- A trap plants a challenge with invented evidence. The stage must hold its ground.
- A control plants a challenge with real evidence that defeats the claim. The stage must give way.

The cases are modeled on claims in the fixture, then sharpened so the truth is clear-cut. They are not word-for-word quotes.

Each case runs 3 times through `claude -p`. Every call uses the production prompt, the production schema (`--json-schema`), and the web search and fetch tools only. The call runs with `--safe-mode`, so your plugins, hooks, MCP servers, and CLAUDE.md do not load. It passes `--tools WebSearch,WebFetch` and `--allowedTools WebSearch,WebFetch`, because `--tools` alone does not grant permission in `-p` mode.

A `partial` reply counts as a pass for both reply traps and reply controls. A ruling passes only when it matches the expected verdict.

A stage has a result and a confidence.

- The plan is the number of cases of that stage and kind, times the repeats.
- A stage is `incomplete` when either kind has fewer valid runs than 5/6 of its plan, rounded up. It gets no PASS or FAIL.
- Otherwise the stage is `PASS` when trap resistance and control acceptance are both at least 5/6 of the valid runs, and `FAIL` when not.
- Confidence is High when every planned run is valid and scored. It is Medium when there are enough valid runs but some calls failed or were invalid. It is Low when the stage is `incomplete`.

The report shows a reply `partial` with the confidence change, for example `partial 85→78`. Rows saved before the start confidence was recorded show `partial →78`. The change does not affect the score.

A failed call keeps the CLI's error subtype, for example a budget stop. The report lists it under "Failed calls".

To run the probe:

```
node evals/probe.mjs --run-id <id> --budget-usd 5
```

Options:

- `--run-id <id>` is required.
- `--budget-usd <n>` caps the spend. The default is 5. It must be a number above 0.
- `--repeats <n>` sets the attempts per case. The default is 3. It must be a positive integer.

The command prints a usage line and exits 2 when an option is invalid.

Results go to `~/.claude/council-mode-evals/<run-id>/`.

- The budget caps the run. A call that reports no cost counts as $0.50.
- Rerun with the same id to resume. Rows that did not fail are kept.
- 3 failed calls in a row stop the run.

Each row is keyed by case, attempt, and script label. The script label is the short commit of `council.workflow.js`. When that file has uncommitted edits, the label adds `+<8-hex content hash>`. A prompt edit therefore reruns every case without a commit. The report shows one section per script label.

To print the report again and write `report.md` in the run folder:

```
node evals/report.mjs --run-id <id>
```

## Persona test

The persona test checks whether the voter's identity block changes how a voter ranks the same dossier. Design: `docs/superpowers/specs/2026-11-12-council-mode-persona-test-design.md`.

| Version | Identity block |
| --- | --- |
| v1 | Name plus a short description of the person. No stated priorities. |
| v2 | Name plus criteria sheet. This is the production prompt. |
| v3 | Criteria sheet with no name. |

Only the identity block changes. The rest of the prompt comes from the production `votePrompt`.

Run it:

```bash
node evals/persona.mjs --run-id 2026-11-12-persona1 --budget-usd 10
```

Options:

- `--budget-usd`: the dollar cap for the run. The default is 10.
- `--repeats`: the attempts per voter and version. The default is 3.
- `--fixture`: the fixture folder whose dossier the voters rank. The default is `fixtures/2026-11-11-cli-language/`.
- `--voters`: the voters file. The default is `persona-voters.json`.

What a run does:

1. It renders the dossier of `fixtures/2026-11-11-cli-language/` once per voter, in that voter's seeded option order. The order is the same for every version and repeat.
2. It runs 7 voters × 3 versions × the repeats as voter calls. Each call uses the voter's model from `persona-voters.json`, runs in safe mode, and has no tools.
3. It checks each ballot with the production `normalizeBallot` and `validateBallot`. An invalid ballot is counted and never judged.
4. It runs one opus judge call per valid ballot. The judge sees the voter's criteria sheet and the ballot. It never sees the version or the voter's name.

The measures:

- **Tied share:** reasons that the judge tied to one of the voter's criteria, divided by all reasons.
- **Top criterion used:** at least one reason serves the voter's first "Cares about" item.
- **Rejects violations:** adjacent pairs where the higher option breaks the voter's "Rejects" line.
- **Same winner:** how many repeats pick the most common first choice.
- **Ranking spread:** the mean count of option pairs in a different order between 2 repeats.
- **Panel diversity:** the distinct first choices across a version's valid ballots, and the share of the most common one. A share near 1 means the panel herds onto one option.

The decision rule: version A beats version B when A's tied share is at least 0.10 higher and A's ranking spread is not higher. Each version has at most 21 ballots, so only large differences show.

Run handling matches the probe: results go to `~/.claude/council-mode-evals/<run-id>/`, and the run stops at the budget cap or after 3 failed calls in a row. If you rerun the same run id, finished calls are skipped. A finished run therefore re-prints its report and rewrites `report.md` without new calls. If you edit `votePrompt`, change the voters file, or change the fixture, the calls run again under a new script label.

## Sheet-quality test

The sheet-quality test finds out which parts of the voter criteria sheet matter. Design: `docs/superpowers/specs/2026-11-12-council-mode-sheet-test-design.md`.

Each version changes one thing from the production sheet:

| Version | Sheet |
| --- | --- |
| S0 | 3 ranked "Cares about" items + Accepts + Rejects (production) |
| S1 | The same 3 items, marked "in no particular order", in a seeded shuffle |
| S2 | The 3 ranked items, with no Accepts or Rejects line |
| S3 | The top 2 ranked items + Accepts + Rejects |
| S4 | 5 ranked items + Accepts + Rejects |

Run it:

```bash
node evals/sheets.mjs --run-id 2026-11-12-sheets1 --budget-usd 15
```

Options:

- `--budget-usd`: the dollar cap for the run. The default is 15.
- `--repeats`: the attempts per voter and version. The default is 3.

The voters are in `sheet-voters-5lang.json`: the 7 voters of the 5-language follow-up, each with 5 ranked items. The dossier comes from `fixtures/2026-11-12-cli-5lang/`. The run uses the persona test's runner, so budget, resume, the failure stop, and the run folder work the same way.

The judge always scores against the full reference sheet: 5 ranked items, Accepts, and Rejects. It never sees the version or the voter's name. One judge call gives all the measures:

- **Adherence:** reasons tied to a line the voter's own sheet shows, divided by all reasons.
- **Coverage:** reasons tied to any reference line, divided by all reasons.
- **Top-item weight:** reasons that serve the #1 item, divided by reasons tied to any "Cares about" item. This tests ranking (S1 against S0).
- **Rejects violations:** adjacent pairs where the higher option breaks the Rejects line. This tests the limits (S2 against S0).
- **Stability and panel diversity:** as in the persona test.

The decision rule compares each version with S0. A difference counts when the gap is at least 0.10 for adherence, coverage, or top-item weight, 0.15 for the top first-choice share, 0.5 for mean rejects violations, or 0.5 for ranking spread. The ranking-spread bar applies from the run after `2026-11-12-sheets1`. Each version has at most 21 ballots, so only large effects show.

## Sheet v2 test

The sheet v2 test checks 3 parts that published preference prompts have and the production voter prompt lacks. Design: `docs/superpowers/specs/2026-11-12-council-mode-sheet-v2-test-design.md`. Background: `docs/research/prompt-structures.md`.

| Version | Change from production |
| --- | --- |
| V0 | None |
| V1 | A "Serves it" and a "Fails it" line under each "Cares about" item |
| V2 | 3 priority-instruction lines after the sheet |
| V3 | An `assessment` field before `ranking` in the ballot, and a ballot rule to write it first |
| V4 | V1 + V2 + V3 |

Run it:

```bash
node evals/sheets2.mjs --run-id 2026-11-12-sheets2-1 --budget-usd 15
```

The options are the same as the sheet-quality test: `--budget-usd` (default 15) and `--repeats` (default 3).

The voters are in `sheet-voters-5lang-v2.json`: the 7 production voters of the 5-language follow-up, with the approved definitions for each item. The dossier comes from `fixtures/2026-11-12-cli-5lang/`.

The judge scores every version against one reference: the 3 items with their definitions, Accepts, and Rejects. Every version shows all of those lines, so adherence equals coverage, and the report shows adherence only. The report also gives assessment coverage: the share of judged V3 and V4 ballots with a note for every option.

The decision rule compares each version with V0, with the sheet-quality test's bars: 0.10 for adherence or top-item weight, 0.15 for the top first-choice share, 0.5 for mean rejects violations, and 0.5 for ranking spread. V4 against V0 is the headline. Each version has at most 21 ballots, so only large effects show.

## The findings loop

1. Change the plugin.
2. Run `npm test`, then `node evals/invariants.mjs`.
3. If a prompt or a debate helper changed, run the probe.
4. Write `evals/FINDINGS-<date>.md`: what changed, the score table, what was right, what was wrong, and what to improve.
