# Council Mode architecture

Council Mode has 2 parts. The `council` skill runs inside the main conversation, because step 1 and step 8 need the user. The Workflow script `council.workflow.js` runs steps 2–7 as a deterministic program that starts subagents and computes everything that does not need judgment.

## Components

```mermaid
flowchart LR
  user([User])
  subgraph main[Main conversation]
    skill[council skill<br/>SKILL.md]
  end
  subgraph wf[Workflow tool]
    script[council.workflow.js]
    helpers[pure helpers<br/>labels, challenge filter,<br/>reply classifier, flips,<br/>dossier, text flattening,<br/>ballot normalize and check, tally]
    script --- helpers
  end
  subgraph agents[Subagents]
    gen[3 generators + merge]
    adv[1 advocate per option]
    ref[referee<br/>filter + blind rulings]
    vot[7 persona voters]
  end
  user <-->|approve frame,<br/>read report| skill
  skill -->|args| script
  script -->|result| skill
  script --> gen
  script --> adv
  script --> ref
  script --> vot
```

| Part | Runs on | Does |
| --- | --- | --- |
| `SKILL.md` | Main agent | Checks fit, freezes the problem and panel with the user, starts the workflow, writes the report, groups similar flip conditions and hybrids |
| Orchestration body | Workflow runtime | Checks the arguments, calls agents in the right order, with barriers only where a stage needs every result of the stage before, and stops the run when an agent fails |
| Pure helpers | Workflow runtime | Every rule that code can enforce: seeded labels and order, evidence checks, classification, flip warnings, dossier, text flattening, ballot cleanup and validity, tally |
| Agents | Subagents | Only the work that needs judgment: options, research, challenges, rewrites, replies, rulings, ballots |

## A run, in order

```mermaid
sequenceDiagram
  actor U as User
  participant S as council skill
  participant W as council.workflow.js
  participant G as Generators + merge
  participant A as Advocates
  participant R as Referee
  participant V as Voters
  S->>U: problem statement + 7 personas + budget
  U->>S: approve (frame is now locked)
  S->>W: Workflow(scriptPath, args)
  Note over W: code checks the args and throws if they are bad
  Note over W: Generate, skipped when args hold fixed options
  W->>G: 3 generators in parallel, then merge
  G-->>W: options + baseline
  Note over W: code keeps the first 5 options, and stops if fewer than 3
  Note over W: Research
  W->>A: 1 advocate per option, in parallel
  A-->>W: cases (claims, weaknesses, failed tests)
  Note over W: Challenge
  W->>A: round 1, all at once
  A-->>W: challenges
  Note over W: code rejects challenges with no evidence, unknown or own claims, or over 2 per rival
  Note over W: Referee
  W->>R: strip the tone
  R-->>W: neutral challenge text
  Note over W: Reply
  W->>A: round 2, all at once
  A-->>W: refute / concede / partial, tagged by advocate
  Note over W: Rule
  W->>R: 1 blind ruling per disputed claim, with every challenge against it
  R-->>W: claim holds or not
  Note over W: code builds the dossier
  Note over W: Vote
  W->>V: dossier, shuffled per voter
  V-->>W: ranked ballots with cited reasons
  Note over W: code normalizes and validates ballots, then tallies
  W-->>S: result
  S->>U: report, and the user decides
```

The merge prompt asks for at most 5 options, plus a baseline. If the problem statement says the change or build is already decided, the baseline is the simplest thing that meets the hard constraints. Otherwise the baseline is "change nothing". If the merge or the fixed `options` give more than 5 options, code keeps the first 5 and adds a warning. The "too many options" stop is still in the code for safety, but the cap makes it unreachable.

A run makes at most 12 + 3N agent calls plus 1 ruling call per disputed claim. N is the number of options including the baseline, so N is at most 6. The 12 fixed calls are 3 generators, 1 merge, 1 referee filter, and 7 voters. Each option costs 1 advocate, 1 challenge call, and 1 reply call.

If one generator fails, code drops its options and the run goes on. The run stops and returns a `stopped` reason when all 3 generators fail, when the merge fails, or when any agent from Research through Rule fails. The skill then offers to resume the run.

## How data flows

Boxes are data. Arrows name the step that turns one into the next. `code` marks a step with no agent.

```mermaid
flowchart TD
  args[args<br/>problem, personas, budget,<br/>models, seed] -->|generators + merge,<br/>or fixed options| opts[options<br/>+ baseline]
  opts -->|code: seeded labels| labeled[labeled options<br/>K, M, B, ...]
  labeled -->|advocates| cases[cases<br/>claims K-C1, weaknesses K-W1]
  cases -->|advocates, round 1| rawch[raw challenges]
  rawch -->|code: evidence, own claim,<br/>unknown claim, 2 per rival| acc[accepted CH1, CH2, ...]
  rawch --> rej[rejectedChallenges]
  acc -->|referee rewrite,<br/>code: match by ID| neutral[neutral challenges]
  acc -->|code: no rewrite| warn[warnings]
  neutral -->|advocates, round 2| replies[replies<br/>tagged by advocate]
  replies -->|code: classify| cls[concessions X1<br/>voided<br/>disputes<br/>unanswered U1<br/>drops]
  replies -->|code: stray, duplicate| warn
  cls -->|code: group by claim,<br/>then referee, blind| rul[rulings R1<br/>1 per disputed claim]
  cls --> flips
  rul -->|code: flip counts| flips[flips<br/>sycophancy / stubbornness]
  args -->|problem| dos
  labeled --> dos
  cases --> dos
  cls --> dos
  rul --> dos
  flips --> dos[dossier]
  dos -->|code: shuffle per voter,<br/>order sections, flatten text, render| text[7 dossier texts]
  text -->|voters| bal[ballots]
  bal -->|code: normalize| norm[normalized ballots]
  norm -->|code: validate| valid[valid ballots]
  norm --> disc[discarded]
  bal -->|voter agent failed| disc
  valid -->|code: Condorcet, Borda| res[result<br/>winner, method, pairwise,<br/>borda, fragile, voters]
  valid -->|code: adjacent-pair reasons| cit[citations]
  res --> out[workflow result]
  cit --> out
  valid -->|ballots| out
  labeled -->|options| out
  disc --> out
  dos --> out
  rej --> out
  warn --> out
  out -->|skill| report[report to the user]
```

Notes on the steps:

- **Flatten text.** `oneLine` turns every piece of model-written text into one line before it goes into a prompt or the dossier. A model cannot add a fake heading, claim, or ruling with a line break.
- **Match replies.** Each advocate's replies stay tagged with its option label. A reply counts only if it answers a challenge against that option. Code ignores a stray reply (a challenge against another option, or an unknown ID) and a second reply to the same challenge. Both kinds are counted in `warnings`.
- **Match rewrites.** `applyRewrites` matches the referee's rewrites to challenges by ID, after trimming and uppercasing. A challenge with no usable rewrite keeps its original text, and its ID goes in `warnings`.
- **Confidence drops.** Every reply gives `newConfidence` and `dropReason`. A drop with an empty `dropReason` is recorded in `drops`.
- **Order per voter.** Each voter gets its own option order. Options appear in that order, and so do the entries of every evidence section (`byOrder`).
- **Normalize, then validate.** `normalizeBallot` turns "Option K" and "k" into "K", pulls valid dossier IDs out of each `cites` entry, and drops unknown labels from `unacceptable`. Then `validateBallot` checks the ballot. Only real defects discard a ballot.
- **Count citations.** `citationCounts` counts only reasons for adjacent pairs in the voter's own ranking. Each voter counts at most once per ID.

## IDs

Every item a voter can cite has an ID. Option labels are random letters that avoid the prefixes below.

| ID | Item | Made by |
| --- | --- | --- |
| `K-C1` | Claim 1 of Option K | `numberCase` |
| `K-W1` | Weakness 1 of Option K | `numberCase` |
| `CH1` | Accepted challenge 1 | `collectChallenges` |
| `X1` | Concession with evidence | `classifyReplies` |
| `R1` | Disputed claim and its ruling. 1 ruling covers every disputed challenge against the claim. IDs follow the order of each claim's first dispute | `groupDisputes`, then the referee |
| `U1` | Unanswered challenge | `classifyReplies` |

A ballot reason must cite at least one claim, weakness, ruling, concession, or unanswered ID. A bare option label does not count. `CH1` IDs are internal: voters cannot cite them.

## Workflow arguments

| Argument | Required | Meaning |
| --- | --- | --- |
| `problem` | yes | The frozen problem statement |
| `personas` | yes | Exactly 7 `{ name, criteria, model }`, with different names |
| `budget` | no | Research budget text; default "at most 20 tool calls" |
| `advocateModel` | no | Model for advocates; default is the session model |
| `refereeModel` | yes | Model for the referee. The script compares it with `advocateModel` only when `advocateModel` is given. If `advocateModel` is left out, the skill must pick a referee model that differs from the session model |
| `seed` | no | Integer for labels and voter order; default 1 |
| `isolateAdvocates` | no | `true` runs the advocate research, challenge, reply, and ruling agents in git worktrees, because any of them may run tests. Generators, the merge, the referee filter, and voters never get a worktree |
| `thresholds` | no | `{ sycophancy, stubbornAdverse }`; default `{ sycophancy: 0.75, stubbornAdverse: 2 }`. Sycophancy: the advocate conceded at least this share of the challenges against it. Stubbornness: the advocate conceded nothing and got at least `stubbornAdverse` adverse rulings. The script uses `stubbornAdverse` only when it is a positive integer |
| `options`, `baseline` | no | Fixed options that skip Generate, for a hybrid round. Each is a string or `{ description }`. Code keeps the first 5 options and adds a warning if there are more. The script reads `baseline` only together with `options`, and ignores it otherwise. The default baseline is "Change nothing." |

The script throws, before it starts any agent, if `problem` is missing, there are not exactly 7 personas, `refereeModel` is missing, `refereeModel` equals `advocateModel`, 2 personas have the same name, or a fixed option or baseline has no description.

## Workflow result

| Field | Holds |
| --- | --- |
| `stopped` | Present only when the run stops early. The reasons are: fewer than 3 options (merged options with an empty description do not count), too many options ("too many fixed options" when `options` was given, otherwise "too many options after the merge"), every ballot discarded, or a failed agent. A failed agent means all 3 generators, the merge, an advocate, a challenge agent, the referee filter, a reply agent, or a ruling. A failed-agent reason ends with "resume the run to retry it". A merge that returns no baseline is not a failed agent: a resume would replay the same answer, so its reason says to start the run again with a new seed. The other fields depend on the stop: a generator, merge, or too-many-options stop returns only `stopped`. A fewer-than-3-options stop and a failed advocate, challenge agent, referee filter, reply agent, or ruling return `stopped` and `options`. An every-ballot-discarded stop returns `stopped`, `options`, `dossier`, `rejectedChallenges`, `discarded`, and `warnings` |
| `warnings` | Problems that did not stop the run: options cut to the first 5, challenges the referee did not rewrite, and stray or duplicate replies |
| `options` | Labeled options, with the `baseline` flag |
| `dossier` | Everything voters saw: the problem, claims with status and confidence (shown as `confidence 80 → 40` when a reply lowered it with an explanation; the lowest explained value counts), weaknesses, failed tests, rulings, concessions, voided concessions, unanswered challenges, unexplained confidence drops, flip counts |
| `rejectedChallenges` | Challenges stopped before delivery, with the reason: unknown claim, own claim, no evidence, or over limit |
| `result` | `method` (condorcet, borda, tie), `winner`, `tied`, `pairwise`, `borda`, `fragile`, `unacceptableVotes`, `voters` |
| `citations` | Dossier IDs with the number of voters who cited each, most cited first |
| `ballots` | Valid, normalized ballots: persona, model, ranking, reasons, flip condition, unacceptable marks, hybrid |
| `discarded` | Discarded ballots and their problems, including voters whose agent failed |

## Where each rule lives

| Spec rule | Enforced by |
| --- | --- |
| Challenges must cite evidence | `collectChallenges` (code) |
| At most 2 challenges per rival | `collectChallenges` (code) |
| Strip the tone | Referee filter agent; `applyRewrites` keeps the evidence unchanged |
| Hide identities | Prompts: replies and ballots never show who wrote a challenge or which model an advocate uses; the referee filter removes references to the author. The referee keeps evidence text unchanged, so an author reference inside the evidence can still reach the replying advocate |
| Model text cannot forge structure | `oneLine` flattens text in prompts and the dossier (code) |
| Replies answer only own challenges | `classifyReplies` ignores stray and duplicate replies (code) |
| Concessions must cite evidence | `classifyReplies` voids them (code) |
| Confidence drops need evidence | `classifyReplies` records a drop with no `dropReason` as unexplained; for a concede or partial reply, its evidence counts as the explanation. Explained drops become the revised confidence that `buildDossier` shows to voters (code) |
| Answer every challenge | `classifyReplies` records unanswered challenges (code) |
| Rulings are binding | `buildDossier` marks the claim struck (code). A false ruling counts as 1 adverse ruling for the option, however many challenges it covers |
| Simultaneous rounds | `parallel()` with one call per advocate per round |
| Blind referee | `rulingPrompt` shows no claim ID, ruling ID, or option label |
| 1 ruling per disputed claim | `groupDisputes` groups disputes by claim; `rulingPrompt` lists every challenge and defense (code) |
| At most 5 options | Merge prompt, then code keeps the first 5 |
| Neutral labels, shuffled order | `assignLabels`, `shuffle` with `seed`, `byOrder` (code) |
| Reasons must cite evidence | `normalizeBallot` cleans labels and IDs, then `validateBallot` checks them (code) |
| A failed agent never skews the dossier | The run stops with "resume the run to retry it" (code) |
| Condorcet, then Borda, then tie | `tally` (code) |
