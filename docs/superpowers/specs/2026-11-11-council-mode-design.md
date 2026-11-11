# Council Mode: Design Spec

2026-11-11 · Matthew Brandenburg

Source of truth for the design discussion: [Debate Jury: Design Spec](https://claude.ai/artifact/59BQ8CxkEAwJjCoaDDMo7p). "Debate Jury" was the working name; the product is Council Mode. This file copies that document into the repo and adds the implementation notes at the end.

## Overview

Council Mode picks one solution from 3 or more options. Each option gets an advocate who builds an evidence-backed case, the advocates debate under a referee, and a panel of 7 voters ranks the options from a written dossier.

**Core principle: only evidence can move a position.** Confidence, repetition, and speaking order must not. Every rule in this spec enforces part of that principle.

### Goals

- Pick the option with the strongest evidence, not the option with the best-written argument.
- Limit the 3 known faults of LLM panels: sycophancy (an agent gives up a correct point under pressure), stubbornness (an agent ignores a valid point), and anchoring (the first idea or the first speaker sets the frame).
- Show *why* an option wins: which evidence decided it, which stakeholders preferred it, and what would change the result.

## Scope

Use Council Mode for decisions that are expensive to reverse and have 3 or more defensible options: architecture choices, data models, vendor or library selection, API surface design.

Do not use it for:

- Small or easily reversed decisions. A lighter multi-lens review covers those at a fraction of the cost.
- Questions with one checkable answer. A test or a lookup settles those faster than a debate.
- Problems with fewer than 3 real options. A two-way comparison needs no council.

Non-goals:

- The pipeline does not make the final decision. It gives the user a ranked result with its evidence, and the user decides.
- The pipeline does not invent the problem statement. The user approves it in step 1.

## Pipeline overview

The user sets the frame in step 1 and makes the final decision after step 8. Agents and code run everything between.

1. Freeze the problem and the panel (main agent + user)
2. Generate options (2–3 generators in parallel, then a merge)
3. Research and test (1 advocate per option, in parallel)
4. Debate (advocates + referee)
5. Build the dossier (code)
6. Vote (7 voters in parallel)
7. Tally (code, no agent)
8. Report (the user decides)

If the debate shows the problem statement is wrong, the run stops and restarts from step 1.

## Step 1: Freeze the problem and the panel

The main agent writes the problem statement and the voter panel together, before any option exists. The user approves both, and then both lock.

1. **Write the problem statement.** Include the goal, the hard constraints, and what counts as success.
2. **Write 7 personas from the stakeholders of the problem**, not from possible solutions. Ask: "Who lives with the result of this decision?"
3. **Give each persona a criteria sheet**, not only a job title. A title alone invites stereotype voting.
4. **Assign each persona a model.** Spread the panel across at least 2 models.
5. **Show the problem statement and the panel to the user for approval.** This is the only human checkpoint before the vote.
6. **Lock both items.** No later stage can edit them. If the debate shows the problem statement is wrong, stop the run and restart from step 1.

Criteria sheet format:

```
Persona: Maintainer
Cares about (in order): readability, test coverage, number of dependencies
Accepts: slower runtime if the code stays simple
Rejects: any option that needs a specialist to change it
Model: sonnet
```

Rules against a hidden favorite:

- The agent writes the personas in the same step as the problem statement, before it starts any option generator.
- A criteria sheet must not name a solution approach. "Cares about latency" is allowed. "Prefers caching" is not.

## Step 2: Generate options

1. **Start 3 generators in parallel.** Each gets only the frozen problem statement.
2. **Merge and deduplicate.** Combine options that differ only in detail. Keep options that differ in approach.
3. **Add a baseline option**, such as "change nothing" or "the simplest thing that works."
4. **Assign random letter labels**, such as "Option K." Do not use names that sell.

If the merge leaves fewer than 3 real options plus the baseline, stop and tell the user: the problem does not need a council.

## Step 3: Research and test

One advocate per option builds the strongest honest case for that option.

- **Equal budget.** Every advocate gets the same research budget.
- **Evidence labels.** Each claim is *tested* (the advocate ran it), *cited* (a source states it), or *reasoned* (argument only).
- **Disclosure rule.** Each advocate reports its 2 strongest weaknesses and every failed test.
- **Confidence scores.** Each claim carries a confidence score from 0 to 100.
- **Isolation.** An advocate that changes code to run tests works in its own git worktree.

Claims get IDs such as `K-C1`; weaknesses get IDs such as `K-W1`.

## Step 4: Debate

Two structured rounds under a neutral referee. All advocates write each round at the same time.

1. **Round 1, challenges.** Each advocate challenges up to 2 claims of each rival, by claim ID.
2. **Round 2, replies.** Each advocate replies to every challenge against it.

Rules against sycophancy:

1. **Challenges must cite evidence.** A challenge without evidence is rejected before the advocate sees it.
2. **Concessions must cite evidence.** A concession without evidence is voided and flagged; the claim stands.
3. **Strip the tone.** The referee rewrites each challenge into neutral form.
4. **Hide identities.** Advocates do not know which model or persona wrote a challenge.
5. **Commit confidence first.** A confidence drop without evidence is flagged.

Rules against stubbornness:

6. **Answer every challenge.** Each reply is *refute*, *concede*, or *partial*. A challenge with no reply is marked **unanswered**.
7. **Referee rulings are binding.** A claim ruled false is marked struck in the dossier.

Rules against anchoring:

8. **Write each round at the same time.**
9. **Use the frozen problem statement.**
10. **Keep the referee blind.** The referee sees the disputed claim and the evidence, but not which option the claim supports.
11. **Use neutral labels.**

Flip monitoring: a **sycophancy** warning when an advocate concedes 75% or more of the challenges against it; a **stubbornness** warning when it concedes none while 1 or more rulings go against it. These are starting values, open to refinement after the validation runs.

## Step 5: Build the dossier

Voters read a structured dossier, not the debate transcript.

| Section | Contents | ID form |
| --- | --- | --- |
| Problem | The frozen problem statement | — |
| Options | Label and description | K, M, … |
| Claims | Claim, evidence label, confidence, status (stands, conceded, struck) | K-C1 |
| Weaknesses | Disclosed weaknesses and failed tests | K-W1 |
| Rulings | Disputed claim, what was checked, ruling | R1 |
| Concessions | Conceded claim and the evidence | X1 |
| Unanswered | Challenges with no reply | U1 |
| Flip counts | Concessions and adverse rulings per advocate | — |

No advocate identities or model names. The option order is shuffled separately for each voter.

## Step 6: Vote

The 7 frozen personas each submit a ballot:

1. A full ranking of all options.
2. One pairwise reason for each adjacent pair in the ranking.
3. Dossier IDs cited by each reason. A reason that cites no valid dossier ID voids the ballot.
4. A flip condition: "My ranking changes if ___."
5. Optional unacceptable marks.
6. An optional hybrid proposal. A hybrid cannot win directly.

## Step 7: Tally

1. Build the pairwise table.
2. If one option beats every rival head to head, it is the Condorcet winner.
3. Otherwise, use a Borda count (last place = 0 points, each place up = 1 more).
4. If the Borda count also ties, report a tie; the user decides.
5. If the winner collects 2 or more unacceptable marks, flag the result as fragile.

Instant-runoff voting is not used: with few voters it eliminates a compromise option that every voter ranks second (center squeeze).

## Step 8: Report

1. Winner and method, and the fragile flag if set.
2. Pairwise table.
3. Persona × option matrix.
4. Most-cited evidence, with voter counts.
5. Shared flip conditions (named by 2 or more voters).
6. Debate record: rulings, concessions, voided concessions, unanswered challenges, flip warnings.
7. Discarded ballots and the reason for each.
8. Hybrid candidates that 2 or more voters proposed. The user decides whether to run a second round with the hybrid as an option.

A close result means the options are near-equal; the report states this plainly.

## Decisions

| Topic | Decision |
| --- | --- |
| Packaging | An independent plugin in its own repo (`council-mode`, own `marketplace.json`): a skill plus a Workflow script |
| Baseline advocate | The baseline gets a full advocate |
| Referee model | A different model from the advocates |
| Research budget | Set per run in step 1; the user approves it |
| Flip thresholds | 75% conceded → sycophancy; 0 conceded with 2+ adverse rulings → stubbornness (`thresholds.stubbornAdverse`, default 2). The first live run showed that 1 adverse ruling was too sensitive. Open to refinement |
| Option cap | At most 5 options plus the baseline. The merge prompt asks for at most 5 and keeps the most different approaches; code keeps the first 5 of a longer list and adds a warning. Set after the first live run merged 6 options |
| Rulings | 1 blind ruling per disputed claim, not per challenge. The ruling prompt lists every challenge and defense against the claim. The R ID belongs to the claim's ruling. Set after the first live run made 29 ruling calls |
| Borda ties | Report a tie; the user decides |
| Hybrid round | The report lists the hybrid; the user decides whether to run a second round |
| Documentation | `docs/architecture.md` explains how the plugin works and how data flows, with diagrams of the components, the run sequence, and the data flow. A test keeps it in step with the script |

## Implementation notes

- **Skill + workflow split.** The skill runs step 1 (it needs the user) and step 8 (it groups similar flip conditions and hybrids, which needs judgment). The Workflow script runs steps 2–7. Code in the script does the tally, ballot validation, flip counts, and dossier, so those parts are deterministic and unit-tested.
- **Advocates do not keep context across rounds.** Workflow agents start fresh on every call. Each debate prompt carries the advocate's own case instead. A run makes at most 12 + 3N agent calls (3 generators, 1 merge, N advocates, N challenge calls, 1 referee filter, N reply calls, 7 voters) plus 1 ruling call per disputed claim. N includes the baseline, and N ≤ 6. The design discussion's "11 + 3N" left out the merge call.
- **Referee calls.** The referee runs as 1 filter call plus 1 blind ruling call per disputed claim, all on the referee model.
- **Randomness.** Workflow scripts cannot call `Math.random`. The skill passes a `seed`; the script uses a seeded generator for labels and per-voter order.
- **Hybrid round.** The workflow accepts fixed `options` and `baseline` arguments, which skip step 2. The skill uses them for a second round with a hybrid.
