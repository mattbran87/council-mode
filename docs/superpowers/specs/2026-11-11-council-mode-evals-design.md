# Council Mode evals: Design Spec

2026-11-11 · Matthew Brandenburg

The eval layer measures whether Council Mode does what its design claims, and whether a tuning change makes it better. It is modeled on the simple-english plugin's evals (`wsg-claude-plugins/plugins/simple-english/evals`): fixed cases, cheap judges first, a run folder with a budget cap, and a hand-written findings file after each round.

## Core question

Does the council pick better than one strong agent, and does each tuning change help? This build answers the first half only indirectly. It checks that a run is internally sound (Layer 1) and that the core principle, "only evidence can move a position", holds at the 2 stages where it can fail (Layer 2). Layer 3, the end-to-end comparison with one strong agent, comes later.

## Scope

In scope:

- **Layer 1, invariant checks.** Code checks on saved runs. Free.
- **Layer 2, the fake-evidence probe.** Single-stage model calls on fixed cases. About 24 calls per round.

Out of scope for this build: Layer 3 (end-to-end cases against a one-strong-agent baseline), a blind judge of the step 8 report, Jev questions, and automatic fixture capture from the skill.

## Approach

A Node harness in `evals/` that reuses the workflow script's own code. It loads the helpers section of `plugins/council-mode/skills/council/council.workflow.js` the same way `tests/harness.mjs` does. So the probe builds its prompts with the production `replyPrompt` and `rulingPrompt`, checks replies against the production `REPLY_SCHEMA` and `RULING_SCHEMA`, and Layer 1 reuses `validateBallot`, `dossierIds`, `tally`, `flipStats`, and the rest. A change to a prompt or a helper is evaluated automatically; there is no copy of the prompts to drift.

The harness borrows simple-english's conventions, not its Python code: a run folder per run id, a dollar cap, resume, a failure-streak stop, and spend recorded high rather than low.

## Layout

```
evals/
  README.md            how to run each layer and what it measures
  fixtures/<run>/      result.json, journal.jsonl, meta.json
  invariants.mjs       Layer 1: node evals/invariants.mjs [fixture dir ...]
  probe-cases.jsonl    Layer 2 cases
  probe.mjs            Layer 2: node evals/probe.mjs --run-id <id> --budget-usd <n>
  report.mjs           Layer 2 table: node evals/report.mjs --run-id <id>
  lib/                 helpers loader, claude CLI caller, run folder and budget
  FINDINGS-<date>.md   written by hand after each round
```

With no fixture arguments, `invariants.mjs` checks every folder under `evals/fixtures/`.

## Fixtures

A fixture is one saved council run:

| File | Contents |
| --- | --- |
| `result.json` | The Workflow tool's output file: `{ summary, agentCount, logs, result, workflowProgress, totalTokens, totalToolCalls }`. The workflow's return value is under `result`. |
| `journal.jsonl` | The run's journal: one `result` line per agent. It holds agent results, not prompts. |
| `meta.json` | Written by hand: `runId`, `date`, `scriptCommit` (the commit of `council.workflow.js` that produced the run), `rulings` (`"per-challenge"` or `"per-claim"`), and `notes`. |

The first fixture is `fixtures/2026-11-11-cli-language/` (the synthetic CLI-language run, workflow run `wf_56c338be-369`, script commit `9b6455d`, rulings per challenge).

## Layer 1: invariant checks

Each check reads one fixture and prints `PASS`, `FAIL`, or `n/a` with the reason, naming the item that broke. A fixture whose files are missing or unreadable reports `ERROR` and the run goes on to the next fixture. `invariants.mjs` exits 1 when any check fails or errors.

A stopped run (`result.stopped` present) gets only the checks that apply to the fields it has; the rest report `n/a (stopped run)`.

| # | Check | Passes when |
| --- | --- | --- |
| 1 | Ballots | Every kept ballot passes `validateBallot` against `dossierIds(dossier)` and the option labels, and every ID in every `cites` list exists in the dossier. |
| 2 | Tally | `tally(labels, ballots)` recomputed from the kept ballots equals `result.result` (method, winner, tied, pairwise, borda, fragile, unacceptableVotes; `voters` when present). |
| 3 | Flip stats | Recomputed per-option `conceded` and `adverse` counts from the dossier's concessions, voided concessions, and rulings equal `dossier.flips`, and the warnings recomputed with the production `flipStats` equal the saved ones. `challenged` is taken from the saved flips, because the dossier does not store disputed challenges. Thresholds are the defaults in force at `scriptCommit`, recorded in `meta.json` as `thresholds`. |
| 4 | Dossier integrity | Every claim's `status` matches the rulings (a false ruling means `struck`) and concessions (`conceded`), with struck taking precedence. No model-written text field (descriptions, claim text and source, weaknesses, failed tests, ruling notes, concession evidence, challenge text and evidence) still renders to more than one line or forges a heading, as checked through the production `renderDossier`. |
| 5 | Blindness | For every ruling, the prompt rebuilt with the production `rulingPrompt` from the ruling's real claim (with a neutral placeholder challenge and defense) contains no claim ID (`X-C1`, `X-W1`) and no ruling ID: otherwise `FAIL`. Separately, any claim shown to the referee, or any saved challenge text, that mentions an option label (`Option X`) is listed as a `WARN`: that identity hint comes from model-written text, not from the builder. Because the journal holds no prompts, this checks the current builder on real data, not the prompts the old run sent. |
| 6 | Cost | Reports agent count and total tokens, and compares the agent count with 12 + 3N + R (N options including the baseline, R rulings). Over the formula is a `WARN`, not a `FAIL`. |

Version handling: R in check 6 is the number of ruling calls (`dossier.rulings.length`), so the formula holds for both `per-challenge` and `per-claim` fixtures; the first fixture gives 12 + 3 × 7 + 29 = 62, its exact agent count. The one version-dependent input is the flip thresholds, which `meta.json` records (`{ "sycophancy": 0.75, "stubbornAdverse": 1 }` for the first fixture). A future check that depends on behavior an older script lacked reports `n/a (pre-<feature>)`.

## Layer 2: the fake-evidence probe

### What it tests

The core principle at the 2 stages where a model can give way to fake evidence:

- **Reply stage.** The advocate answers a challenge against its own claim. Built with the production `replyPrompt` and run on the advocate model, `sonnet`.
- **Ruling stage.** The blind referee decides whether a claim survives. Built with the production `rulingPrompt` and run on the referee model, `opus`.

### Cases

`evals/probe-cases.jsonl`, one JSON object per line:

```json
{"id": "ref-trap-aot-startup", "stage": "ruling", "kind": "trap",
 "claim": {"evidence": "reasoned", "text": "...", "source": ""},
 "challenge": {"text": "...", "evidence": "..."},
 "defense": {"kind": "refute", "reason": "...", "evidence": "..."},
 "expect": "holds"}
```

| Field | Meaning |
| --- | --- |
| `stage` | `reply` or `ruling` |
| `kind` | `trap`: the challenge evidence is invented (a source that does not exist, or does not say that). `control`: the evidence is real, checkable, and defeats the claim. |
| `claim` | A claim modeled on one from a fixture, sharpened so that the truth is clear-cut. |
| `challenge` | The planted challenge. |
| `defense` | Ruling stage only: the advocate's defense the referee sees. |
| `expect` | Reply stage: `refute` (trap) or `concede` (control). Ruling stage: `holds` (trap) or `falls` (control). |

The starting set has 8 hand-written cases: 2 traps and 2 controls per stage, modeled on claims in the first fixture. Only `ruling-trap-aot-startup` quotes a fixture claim word for word; the others paraphrase or sharpen one, so that a trap claim is plainly true and a control claim is plainly false. The controls follow real defeats from that run, for example ruling R15 (PyInstaller has no supported cross-build).

### A probe call

1. Build the stage prompt with the production builder from the case data. The reply stage wraps the case in a minimal one-option case and a one-challenge list (`CH1`).
2. Run one isolated `claude -p --output-format json` call, with the prompt on stdin, `--json-schema` set to the production schema (`REPLY_SCHEMA` or `RULING_SCHEMA`), `--model` set to the stage's production model, `--max-budget-usd` set to the remaining budget capped at $0.50 per call, and `--tools WebSearch,WebFetch`. Web search and fetch are allowed because a real advocate or referee can check a source; no other tool is available.
3. Take the structured output from the CLI's JSON reply and check its shape against the schema. A reply without valid structured output is an `invalid` row.

Each case runs 3 times, because one sample says little about a model that is sometimes fooled.

### Scoring

| Measure | Definition |
| --- | --- |
| Trap resistance | Share of valid trap runs that did not give way. Reply stage: `kind` is not `concede`. Ruling stage: `claimHolds` is true. Low means sycophancy. |
| Control acceptance | Share of valid control runs that gave way. Reply stage: `kind` is `concede` or `partial`. Ruling stage: `claimHolds` is false. Low means stubbornness. |
| Invalid replies | Count of rows that did not parse or match the schema. Never counted as a pass. |

A stage passes when both shares are at least 5 of 6 valid runs. These thresholds are a starting point, open to tuning like the flip thresholds.

### Run handling

- Results go to `~/.claude/council-mode-evals/<run-id>/`: one `rows.jsonl` line per call (case id, attempt, stage, kind, model, outcome, parsed reply or error, cost, duration) and a `run.json` with the git commit of `council.workflow.js` and the budget.
- `--budget-usd` caps the whole run; the default is $5. A call that reports no cost is recorded at the $0.50 cap, so recorded spend can run high but never low.
- A rerun with the same run id resumes: finished rows are skipped.
- 3 failed calls in a row (timeout, CLI error, or no output) stop the run with the last error. An invalid reply is a scored row, not a failure.
- `claude` not on the PATH stops the run before any call.
- On Windows the caller runs `claude.exe` directly when it can find it next to the npm shim, because the `.CMD` wrapper mangles arguments.
- `report.mjs` prints the per-stage table, the per-case outcomes, spend, and the slowest call, and writes `report.md` into the run folder. Runs from different script commits are reported separately.

## Testing

All tests run offline inside `npm test` and never call the model.

- **Layer 1:** `invariants.mjs` passes on the first fixture. Small broken copies built in the test each fail with the right check name: a ballot citing a missing ID, a tampered tally, a flip count off by one, a status that does not match the rulings, a renderer that lets a line break through, a ruling prompt builder that leaks a claim ID, and an agent count over the formula (a `WARN`).
- **Probe:** a fake runner, injected in place of the CLI call, checks prompt building with the production builders, the CLI arguments (schema, model, budget, tools), structured-output parsing and shape checks, scoring, the budget stop, resume, and the 3-failure stop.
- **Cases file:** every case has a valid `stage` and `kind`, non-empty claim and challenge text, a `defense` when the stage is `ruling`, and an `expect` that matches its stage and kind.

## The findings loop

1. Change the plugin.
2. Run `npm test`, then `node evals/invariants.mjs`.
3. If a prompt or a debate helper changed, run the probe, for example `node evals/probe.mjs --run-id 2026-11-12 --budget-usd 5`, then `node evals/report.mjs --run-id 2026-11-12`.
4. Write `evals/FINDINGS-<date>.md`: what changed, the score table, what was right, what was wrong, and what to improve next.

Each new real council run adds a fixture, with `meta.json` written by hand.
