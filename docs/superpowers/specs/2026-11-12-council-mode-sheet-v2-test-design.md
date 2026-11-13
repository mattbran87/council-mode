# Council Mode sheet v2 test: Design Spec

2026-11-12 · Matthew Brandenburg

## Question

Published preference prompts include 3 parts that Council Mode's voter prompt lacks (`docs/research/prompt-structures.md`):

1. A definition for each priority.
2. An explicit priority instruction.
3. Reasoning written before the decision.

Does adding them make voters more faithful, steadier, or more diverse? Which part does the work?

## Background

- The sheet test (`evals/FINDINGS-2026-11-12-sheets.md`) found that the sheet's structure matters less than having a sheet, and it settled the template. The template has 3 ranked items at most, plus Accepts and Rejects.
- The value-profile study's best prompt names a few priorities, the values that rank below them, and a definition for each. Removing the lower-priority clause cut alignment from 0.363 to 0.295.
- Rubric judges define each criterion and each level. Prometheus writes its feedback before its score.

## Versions

Every version starts from the production sheet (S0) and adds one part. V4 adds all 3.

| Version | Change from today |
| --- | --- |
| V0 | None: the production sheet and prompt |
| V1 | + Definitions: a "Serves it" and a "Fails it" line under each "Cares about" item |
| V2 | + Priority instruction: 3 lines after the sheet |
| V3 | + Assessment first: the ballot gains an `assessment` field before `ranking` |
| V4 | V1 + V2 + V3 |

### V1 sheet format

```
Cares about (in order):
1. reproducible builds for 3 OSes from one CI
   Serves it: One CI pipeline builds all 3 OS binaries from the same source.
   Fails it: A release needs a separate machine or manual steps per OS.
2. code signing on macOS and Windows
   Serves it: ...
   Fails it: ...
3. small artifacts
   Serves it: ...
   Fails it: ...
Accepts: longer CI builds
Rejects: per-OS build machines kept by hand
```

V0, V2, and V3 keep the production one-line format: `Cares about (in order): a, b, c`.

### V2 priority instruction

These 3 lines go after the sheet, inside the identity block:

```
Weigh your items in order: item 1 counts more than item 2, and item 2 more than item 3.
Give up what your Accepts line names before you give up any item.
Rank an option that has what your Rejects line names below the options that do not.
```

### V3 assessment

The ballot schema gains a first property:

```
assessment: [{ option: string, note: string }]   (listed before ranking)
```

The ballot rules gain one line, placed first: `- assessment: write this first. For each option, one note on how it serves or fails your items, citing dossier IDs. Then rank.`

Reasons compare adjacent pairs in the final ranking, so they cannot come before it. The assessment comes before the ranking instead, as Prometheus puts feedback before its score. `normalizeBallot` and `validateBallot` ignore the extra field, so V3 ballots pass the same checks as V0 ballots.

## Definitions

These definitions were drafted on 2026-11-12, and the user approved them the same day. The voters, items, Accepts lines, and Rejects lines are the 3-item sheets of `evals/persona-voters-5lang.json`.

| Voter | Item | Serves it | Fails it |
| --- | --- | --- | --- |
| Everyday engineer user | fast start | Common commands answer well under 300 ms on all 3 OSes. | Start time is near or over the limit, or grows as the tool grows. |
| | easy install and update | One command installs or updates it, with nothing to install first. | The user must install or manage a runtime, package manager, or PATH setup. |
| | clear help and errors | Every command has built-in help, and errors say what went wrong and what to do. | Errors show raw stack traces or codes with no next step. |
| Platform team maintainer | speed of adding commands | Most of the team can add a command in a day or two with existing patterns. | A new command needs specialist knowledge or long build cycles. |
| | debugging and test tooling | A mature debugger and test framework the team knows, with fast local test runs. | Weak or unfamiliar debugging and testing tools. |
| | few dependencies | The standard library covers most needs. | Core features rely on many third-party packages. |
| Future new hire | readable code | A newcomer can follow a command's logic without special training. | Following the code needs advanced language or framework knowledge. |
| | size of the hiring pool | Many developers on the job market already know the language. | Few candidates know it, so new hires need long training. |
| | quality of docs and examples | Plenty of current official docs and examples for CLI, HTTP, and OAuth work. | Docs for these tasks are sparse or outdated. |
| Release engineer | reproducible builds for 3 OSes from one CI | One CI pipeline builds all 3 OS binaries from the same source. | A release needs a separate machine or manual steps per OS. |
| | code signing on macOS and Windows | CI signs and notarizes the artifacts with standard tools. | Signing needs manual steps, or the artifacts are hard to sign. |
| | small artifacts | Each release download is a few megabytes. | Each release ships a bundled runtime or a large download. |
| Security engineer | supply-chain risk of dependencies | Few dependencies, pinned versions, and a tool to audit them. | A large or unpinned dependency tree that is hard to audit. |
| | memory safety | The language prevents buffer overflows and use-after-free in normal code. | Memory errors are possible in normal code. |
| | fast toolchain patches | A toolchain security fix can be rebuilt and released within a week. | Fixes wait on users updating a runtime themselves. |
| Developer-experience support lead | the same behavior on all 3 OSes | One codebase behaves the same on all 3 OSes, with no OS branches in common commands. | Paths, shells, or runtimes differ by OS and cause OS-specific bugs. |
| | actionable error messages | Errors name the cause and the fix. | Errors are generic or show internals. |
| | easy diagnostics from users | One command collects version, environment, and logs for a ticket. | Support must ask users to gather details by hand. |
| Engineering manager (5-year owner) | total cost of ownership | Low build, run, and maintenance cost over 5 years with the current team. | Hidden costs such as retraining, special build infrastructure, or rewrites. |
| | staffing risk under turnover | At least half the current team can maintain it, and replacements are easy to hire. | It depends on 1 or 2 people or a rare skill. |
| | long-term toolchain support | The toolchain has a published support policy that covers 5 years. | The toolchain's 5-year support is uncertain. |

"Memory safety" is a property proxy: its definition favors some options by design. It is kept because the production sheet already has it. Changing content here would mix this test with a content test.

## Scenario and run

- **Dossier.** `evals/fixtures/2026-11-12-cli-5lang/`, as in the sheet test.
- **Order.** Each voter keeps one seeded option order for every version and repeat.
- **Voter calls.** 5 versions × 7 voters × 3 repeats = 105 calls, on each voter's model, in safe mode, with no tools. V3 and V4 use the extended ballot schema; the others use the production `BALLOT_SCHEMA`.
- **Validity.** `normalizeBallot` and `validateBallot` run on every ballot. An invalid ballot is counted and never judged.
- **Judge calls.** One opus call per valid ballot, in safe mode, with no tools. The judge's reference sheet is the same for every version: the 3 items with their serves and fails lines, plus Accepts and Rejects. It never sees the version or the voter's name. It labels each reason `cares1`–`cares3`, `accepts`, `rejects`, or `none`, and lists Rejects violations, as before.

## Measures

The same as the sheet test, with the reference sheet now 3 items with definitions:

- **Adherence.** Every version shows all reference lines, so adherence equals coverage here. The report shows adherence only.
- **Top-item weight.**
- **Rejects violations.**
- **Same winner and ranking spread.**
- **Distinct first choices and top first-choice share.**

For V3 and V4, the report also gives **assessment coverage**: the share of ballots whose assessment has a note for every option.

## Decision rule, set before the run

Each version is compared with V0. A difference counts when the gap is at least:

- 0.10 for adherence or top-item weight
- 0.15 for the top first-choice share
- 0.5 for mean rejects violations
- 0.5 for ranking spread

V4 against V0 is the headline result. V1, V2, and V3 show which part did the work. Each version has at most 21 ballots, so only large effects show, and the report says so.

## Run handling

The run uses the shared runner (`evals/lib/voter-runner.mjs`), so these work as in the earlier tests:
- the run folder
- the dollar cap; the default here is $15
- resume
- the stop after 3 failed calls in a row
- the error subtype on failed rows
- the script label

The estimated cost is $9–11, because V3 and V4 write longer ballots. It is not measured.

## Approach

- **`evals/lib/voter-runner.mjs`.** The test object gains an optional `voteSchema(version)`. It defaults to `H.BALLOT_SCHEMA`, so the persona and sheet tests do not change.
- **`evals/sheet-voters-5lang-v2.json`.** The 7 voters, each with `cares: [{ item, serves, fails }]` (3 entries), `accepts`, and `rejects`.
- **`evals/lib/sheet2-core.mjs`.** Holds the version texts, the extended ballot schema, the reference-sheet judge prompt with definitions, the measures (reusing `sheetMeasures` logic for 3 items), assessment coverage, the summary, the differences from V0, and the report text.
- **`evals/sheets2.mjs`.** The CLI: `node evals/sheets2.mjs --run-id <id> [--budget-usd 15] [--repeats 3]`.

The judge prompt needs the definitions. `judgePrompt` in `persona-core.mjs` reads criteria through `parseCriteria`, which knows nothing of definitions. So `sheet2-core.mjs` builds its own judge prompt in the same structure: the same rules text, plus the definitions under each item.

## Testing

All tests run offline with a fake runner. They cover:
- the text of each version, including the V1 definitions, the V2 instruction lines, and the V3 ballot rule
- that only the identity block and the ballot rules differ between versions
- that the extended schema lists `assessment` before `ranking` and keeps every production field
- that a V3 ballot with an assessment passes `normalizeBallot` and `validateBallot`
- that the judge prompt holds the definitions and never names a version or a voter
- assessment coverage on hand-made ballots
- the differences from V0, including ranking spread
- that the persona and sheet tests still pass unchanged

## Findings

After the run, add to `evals/FINDINGS-<date>-sheet-v2.md` and `docs/research/evidence-log.md`. Include a recommendation for the voter prompt and the step 1 template.
