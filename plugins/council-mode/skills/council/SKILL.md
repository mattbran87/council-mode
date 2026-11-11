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
- There are fewer than 3 real options.

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
3. **Models.** Each persona gets `sonnet`, `opus`, or `haiku`; use at least 2 different models across the 7. Pick the advocate model, and a different referee model.
4. **Research budget**, in words, such as "at most 15 tool calls; running tests is allowed". Every advocate gets the same budget.
5. **Worktree isolation.** Turn it on only when the working directory is a git repository and advocates must change files to run tests.

Show the whole frame to the user and ask for approval with AskUserQuestion. Revise until the user approves. After approval, the frame is locked: do not edit it later in the run.

## Step 2–7: Start the workflow

Find this skill's base directory in the "Base directory for this skill" line shown when the skill loaded. Call the Workflow tool with `scriptPath` set to `<base directory>/council.workflow.js` and these `args` (pass a JSON object, not a string):

| Argument | Value |
| --- | --- |
| `problem` | The frozen problem statement |
| `personas` | Array of 7 `{ "name", "criteria", "model" }`; `criteria` is the full criteria sheet text |
| `budget` | The research budget text |
| `advocateModel` | The advocate model, or leave it out to use the session model |
| `refereeModel` | Required. The referee model; it must differ from `advocateModel`. If you leave `advocateModel` out, pick a referee model that differs from the session model |
| `seed` | Any integer, such as today's date as YYYYMMDD plus the current minute; it drives labels and voter order |
| `isolateAdvocates` | `true` only under the condition in step 1 |
| `thresholds` | Leave it out to use the default `{ "sycophancy": 0.75 }` |
| `options` | Leave it out, except for a hybrid round (below) |
| `baseline` | Leave it out, except for a hybrid round (below) |

If the Workflow call throws, the arguments are invalid (missing `problem`, not exactly 7 personas, missing `refereeModel`, equal referee and advocate models, or duplicate persona names). Fix the arguments and start again.

If the result has a `stopped` field, report the reason to the user and stop. If the reason ends with "resume the run to retry it", an agent failed: offer to resume the run with `resumeFromRunId`, which replays the finished agents from cache. If every ballot was discarded, show the discarded ballots and their problems.

## Step 8: Report

Write the report in this order. Use the option labels throughout and give each option's one-line description once at the top.

1. **Winner and method.** `result.result.method` is `condorcet`, `borda`, or `tie`. If `fragile` is true, say that 2 or more voters marked the winner unacceptable. If the method is `tie`, name the tied options and say that the evidence does not separate them; the user decides.
2. **Pairwise table** from `result.result.pairwise` (row option against column option).
3. **Persona × option matrix**: each persona's ranking.
4. **Most-cited evidence**: the top entries of `result.citations`, with the cited text from the dossier.
5. **Shared flip conditions**: group the ballots' `flipCondition` values by meaning, and list each group that 2 or more voters named. These are the next things to test.
6. **Debate record**: rulings, concessions, voided concessions, unanswered challenges, unexplained confidence drops, every flip warning (`sycophancy` or `stubbornness`), and every entry in `result.warnings` (such as challenges the referee did not rewrite, or stray and duplicate replies).
7. **Discarded ballots** and the problems for each.
8. **Hybrid candidates**: group the ballots' `hybrid` values by meaning, and list each group that 2 or more voters proposed.

If the margin is narrow, such as a Borda result or a 4–3 pairwise win, say plainly that the options are near-equal.

## After the report

- **Hybrid round.** If a hybrid candidate exists, ask the user whether to run a second round. If yes, start the workflow again with the same frozen frame, a new `seed`, `options` set to the original non-baseline option descriptions plus the hybrid, and `baseline` set to the original baseline description.
- **Wrong frame.** If the debate shows that the problem statement is wrong, say so and restart from step 1. Do not patch the frame in place.
- The user makes the final decision. Do not present the winner as decided.
