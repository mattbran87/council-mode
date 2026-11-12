# Council Mode sheet-quality test: Design Spec

2026-11-12 · Matthew Brandenburg

## Question

The persona test showed that the criteria sheet carries the effect (`evals/FINDINGS-2026-11-12-personas.md`). This test asks which parts of the sheet matter:

- Does it matter that the "Cares about" items are ranked?
- Do the Accepts and Rejects lines change how voters rank?
- How many "Cares about" items work best?

## Provenance

The sheet template is a design choice, made in the Council Mode design session on 2026-11-11 to counter stereotype voting ("A title alone invites stereotype voting"). It was not taken from a published source. The general idea matches later research (`docs/research/2026-11-12-criteria-sheets-vs-personas.md`): explicit, query-relevant values beat identity cues. Its details have not been tested before this run: ranked order, the Accepts and Rejects lines, and 3 items.

The template, from step 1 of the skill:

```
Persona: Maintainer
Cares about (in order): readability, test coverage, number of dependencies
Accepts: slower runtime if the code stays simple
Rejects: any option that needs a specialist to change it
Model: sonnet
```

## Versions

One change at a time, against the production sheet. All versions use the production identity block, which is the persona name plus the sheet.

| Version | Sheet |
| --- | --- |
| S0, baseline | 3 ranked "Cares about" items + Accepts + Rejects (production) |
| S1, unranked | The same 3 items as `Cares about (in no particular order):`, in a seeded shuffle per voter |
| S2, no limits | The 3 ranked items, with no Accepts or Rejects line |
| S3, short | The top 2 ranked items + Accepts + Rejects |
| S4, long | 5 ranked items (S0's 3, plus items 4 and 5) + Accepts + Rejects |

Example for the release engineer:

```
S0  Cares about (in order): reproducible builds for 3 OSes from one CI, code signing on macOS and Windows, small artifacts
    Accepts: longer CI builds
    Rejects: per-OS build machines kept by hand
S1  Cares about (in no particular order): small artifacts, reproducible builds for 3 OSes from one CI, code signing on macOS and Windows
    Accepts / Rejects as S0
S2  Cares about (in order): reproducible builds for 3 OSes from one CI, code signing on macOS and Windows, small artifacts
S3  Cares about (in order): reproducible builds for 3 OSes from one CI, code signing on macOS and Windows
    Accepts / Rejects as S0
S4  Cares about (in order): reproducible builds for 3 OSes from one CI, code signing on macOS and Windows, small artifacts, automatic update delivery to users, simple rollback of a bad release
    Accepts / Rejects as S0
```

## Voters

The 7 voters of the 5-language follow-up, from `evals/persona-voters-5lang.json`. Each voter gets 2 more ranked items, used only by S4 and by the judge's reference sheet. The user approved these on 2026-11-12:

| Voter | Item 4 | Item 5 |
| --- | --- | --- |
| Everyday engineer user | works offline after install | consistent flags across commands |
| Platform team maintainer | easy local reproduction of user bugs | short CI time per change |
| Future new hire | a conventional project layout | good editor and IDE support |
| Release engineer | automatic update delivery to users | simple rollback of a bad release |
| Security engineer | safe handling of stored OAuth tokens | a small attack surface |
| Developer-experience support lead | detailed logs on request | users can check their own setup |
| Engineering manager (5-year owner) | no lock-in to one vendor's tooling | low training cost for new staff |

## Scenario

The pilot uses the dossier of `evals/fixtures/2026-11-12-cli-5lang/`. Its voters split across Go, JavaScript, C#, and Rust, so a sheet change can move a winner.

## A run

1. **Order.** Each voter keeps one seeded option order for every version and repeat, as in the persona test.
2. **Voter calls.** 5 versions × 7 voters × 3 repeats = 105 calls. Each runs on the voter's model, in safe mode, with no tools, with `BALLOT_SCHEMA`.
3. **Validity.** `normalizeBallot` and `validateBallot` run on every ballot. An invalid ballot is counted and never judged.
4. **Judge calls.** One opus call per valid ballot, in safe mode, with no tools. The judge sees the full reference sheet (5 ranked items, Accepts, Rejects) and the ballot. It never sees the version or the voter's name. For each reason, it names the reference line the reason serves: `cares1`–`cares5`, `accepts`, `rejects`, or `none`. It also lists each adjacent pair where the higher option breaks the Rejects line and the lower option does not.

## Measures

The judge's labels give both scores, because every version's sheet is a subset of the reference sheet.

| Measure | Definition | Main test |
| --- | --- | --- |
| Adherence | Reasons tied to a line the voter's own sheet contains, divided by all reasons | All versions |
| Coverage | Reasons tied to any reference line, divided by all reasons | S3 and S4 against S0 |
| Top-item weight | Reasons serving `cares1`, divided by reasons tied to any "Cares about" item | S1 against S0 |
| Rejects violations | Flagged pairs per ballot | S2 against S0 |
| Same winner, ranking spread | As in the persona test | All |
| Distinct first choices, top first-choice share | As in the persona test | All |

For S2, the voter's own sheet has no Accepts or Rejects line, so a reason tied to `accepts` or `rejects` counts for coverage but not for adherence.

## Decision rule, set before the run

Each variant is compared with S0 only. It differs from S0 on a measure when the gap is at least:

- 0.10 for adherence, coverage, or top-item weight
- 0.15 for the top first-choice share
- 0.5 for mean rejects violations
- 0.5 for ranking spread. This bar was added after run `2026-11-12-sheets1` and applies from the next run.

The report lists every difference that passes its bar, with its sign: for example, "S2: rejects violations +0.71". Each version has at most 21 ballots, so only large effects show, and the report says so.

## Run handling

The same as the persona test:
- a run folder under `~/.claude/council-mode-evals/<run-id>/`
- a dollar cap with a default of $15
- resume by run id
- a stop after 3 failed calls in a row
- the error subtype on failed rows
- a script label from the vote prompt, the voters file, and the fixture

The cost is not measured yet. Scaled from the persona runs, it is about $8–9.

## Approach

Generalize the persona harness so that a run takes a list of versions as data. Each version is an id plus a function that builds the voter's identity block. The persona test's v1–v3 become one version set, and S0–S4 become another. The runner, the budget, resume, the judge call, and the report code are shared. The judge prompt and the measures get a reference-sheet form, so that both tests can use them.

- `evals/lib/sheet-core.mjs`: sheet variants, the reference-sheet judge prompt, the measures, and the decision rule.
- `evals/sheets.mjs`: the CLI, `node evals/sheets.mjs --run-id <id> [--budget-usd 15] [--repeats 3]`.
- `evals/sheet-voters-5lang.json`: the 7 voters with 5 ranked items each.
- The persona test's behavior and tests stay unchanged.

## Testing

All tests run offline with a fake runner. They cover:
- each variant's sheet text, including the seeded S1 shuffle, the missing lines in S2, and the item counts in S3 and S4
- that every variant's lines are a subset of the reference sheet
- that the judge prompt holds the reference sheet and never names a version or a voter
- adherence, coverage, and top-item weight on hand-made judgments
- the decision rule, including the sign of each difference
- that the persona test's existing tests still pass unchanged

## Findings

After the run, write `evals/FINDINGS-<date>-sheets.md`. It holds the score table, what each single change did, and a recommendation for the template in step 1 of the skill.
