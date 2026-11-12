# Council Mode evals

Two layers check that Council Mode does what its design claims. Design: `docs/superpowers/specs/2026-11-11-council-mode-evals-design.md`.

| Layer | Command | Cost |
| --- | --- | --- |
| 1. Invariant checks on saved runs | `node evals/invariants.mjs [fixture dir ...]` | Free |
| 2. Fake-evidence probe | `node evals/probe.mjs --run-id <id> --budget-usd 5` | 24 model calls (8 cases, 3 attempts each) |

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

`probe-cases.jsonl` holds 8 hand-written cases. Each stage has 2 traps and 2 controls: the advocate's reply (model `sonnet`) and the blind referee's ruling (model `opus`).

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

## The findings loop

1. Change the plugin.
2. Run `npm test`, then `node evals/invariants.mjs`.
3. If a prompt or a debate helper changed, run the probe.
4. Write `evals/FINDINGS-<date>.md`: what changed, the score table, what was right, what was wrong, and what to improve.
