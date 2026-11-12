---
name: council
description: Use when a decision is expensive to reverse and has 3 or more defensible options — architecture, data model, vendor or library choice, API surface design. Runs Council Mode, in which advocates argue each option with evidence, debate under a blind referee, and a frozen 7-persona panel ranks the options. A run starts 20 or more subagents.
disable-model-invocation: true
---

# Council Mode

Council Mode picks one option from 3 or more by evidence, not by rhetoric. You run step 1 and step 8 with the user. The Workflow script `council.workflow.js`, next to this file, runs steps 2–7.

Core principle: only evidence can move a position. Confidence, repetition, and speaking order must not.

## Before you start: check the fit

Stop and say so if any of these is true. Suggest a lighter review instead.

- The decision is small or easy to reverse.
- A test or a lookup can settle the question.
- The question plausibly has fewer than 3 different approaches. Judge this without listing or ranking options.

If the user named options, keep them out of the problem statement and the criteria sheets. Ask the user whether to let the generators propose options freely (they will likely find the named ones) or to pass the named options as fixed `options`.

## Step 1: Freeze the problem and the panel

Write all of the following in one message, before you think about solutions.

1. **Problem statement.** The goal, the hard constraints, and what counts as success. Do not mention any solution approach.
2. **7 personas**, taken from the stakeholders of the problem: "Who lives with the result of this decision?" Give each a criteria sheet:

   ```
   Persona: Maintainer
   Cares about (in order): readability, test coverage, number of dependencies
   Accepts: slower runtime if the code stays simple
   Rejects: any option that needs a specialist to change it
   Model: sonnet
   ```

   A criteria sheet must not name a solution approach. "Cares about latency" is allowed. "Prefers caching" is not.

   Give 3 ranked "Cares about" items, and no more than 3. 2 is enough when a third item would not separate the options.
3. **Models.** Each persona gets `sonnet`, `opus`, or `haiku`; use at least 2 different models across the 7. Pick the advocate model, and a different referee model. `advocateModel` and `refereeModel` also take `sonnet`, `opus`, or `haiku`.
4. **Research budget**, in words, such as "at most 15 tool calls; running tests is allowed". Every advocate gets the same budget.
5. **Worktree isolation.** Turn it on only when the working directory is a git repository and advocates must change files to run tests. It then applies to the advocate research, challenge, reply, and ruling agents, because any of them may run tests.

Show the whole frame to the user and ask for approval with AskUserQuestion. Revise until the user approves. After approval, the frame is locked: do not edit it later in the run.

## Step 2–7: Start the workflow

Find this skill's base directory in the "Base directory for this skill" line shown when the skill loaded. Call the Workflow tool with `scriptPath` set to `<base directory>/council.workflow.js` and these `args` (pass a JSON object, not a string):

| Argument | Value |
| --- | --- |
| `problem` | The frozen problem statement |
| `personas` | Array of 7 `{ "name", "criteria", "model" }`; `criteria` is the criteria sheet without the Persona and Model lines |
| `budget` | The research budget text |
| `advocateModel` | The advocate model, or leave it out to use the session model |
| `refereeModel` | Required. The referee model; it must differ from `advocateModel`. If you leave `advocateModel` out, pick a referee model that differs from the session model |
| `seed` | Any integer, such as today's date as YYYYMMDD plus the current minute; it drives labels and voter order |
| `isolateAdvocates` | `true` only under the condition in step 1 |
| `thresholds` | Leave it out to use the default `{ "sycophancy": 0.75, "stubbornAdverse": 2 }` |
| `options` | Leave it out, unless the user chose fixed options in the fit check, or this is a hybrid round (below). Strings or `{ "description" }` objects. The script keeps at most 5. |
| `baseline` | Leave it out to use "Change nothing."; give the original baseline description for a hybrid round. |

If the Workflow call throws, the arguments are invalid (missing `problem`, not exactly 7 personas, missing `refereeModel`, equal referee and advocate models, duplicate persona names, or a fixed option or baseline without a description). Fix the arguments and start again.

If the result has a `stopped` field, report the reason to the user and stop. If the reason ends with "resume the run to retry it", an agent failed: offer to resume the run with `resumeFromRunId`, which replays the finished agents from cache. If every ballot was discarded, show the discarded ballots and their problems. If the reason is "fewer than 3 distinct options", show the returned `options` to the user.

## Step 8: Report

Write the report in this order. Use the option labels throughout and give each option's one-line description once at the top.

1. **Winner and method.** `result.result.method` is `condorcet`, `borda`, or `tie`. If `fragile` is true, say that 2 or more voters marked the winner unacceptable. If the method is `tie`, name the tied options and say that the evidence does not separate them; the user decides.
2. **Pairwise table** from `result.result.pairwise` (row option against column option).
3. **Persona × option matrix**: from `result.ballots[].ranking`; list each discarded persona as discarded.
4. **Most-cited evidence**: the top entries of `result.citations`, each with its `voters` count and the cited text: claims and weaknesses in `dossier.options[]`, rulings in `dossier.rulings`, concessions in `dossier.concessions`, unanswered challenges in `dossier.unanswered`.
5. **Shared flip conditions**: group the ballots' `flipCondition` values by meaning, and list each group that 2 or more voters named. These are the next things to test.
6. **Debate record**: `dossier.rulings`, `dossier.concessions`, `dossier.voided`, `dossier.unanswered`, `dossier.drops`, `dossier.flips[]` (every warning, `sycophancy` or `stubbornness`, with the challenged, conceded, and adverse counts), `rejectedChallenges`, and every entry in `result.warnings` (such as options cut to the first 5, challenges the referee did not rewrite, or stray and duplicate replies).
7. **Discarded ballots** and the problems for each.
8. **Hybrid candidates**: group the ballots' `hybrid` values by meaning, and list each group that 2 or more voters proposed.

If the margin is narrow — a Borda result, or a pairwise win by 1 vote (check `result.result.voters`) — say plainly that the options are near-equal.

## After the report

- **Hybrid round.** If a hybrid candidate exists, ask the user whether to run a second round. If yes, start the workflow again with the same frozen frame, a new `seed`, `options` set to the hybrid first, then the original non-baseline option descriptions in final-rank order (by `result.result.borda`, highest first; ties keep the original order), and `baseline` set to the original baseline description. The baseline is never in `options`. The script keeps only the first 5 options, so the cap drops the lowest-ranked original.
- **Wrong frame.** If the debate shows that the problem statement is wrong, say so and restart from step 1. Do not patch the frame in place.
- The user makes the final decision. Do not present the winner as decided.
