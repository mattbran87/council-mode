# Criteria sheet template

A criteria sheet tells 1 voter what to care about. The main session writes 7 sheets in step 1 of the skill (`plugins/council-mode/skills/council/SKILL.md`), and the user approves them. Each voter subagent sees only its own sheet. No other subagent sees any sheet.

The evidence for each rule below is in `evidence-log.md`.

## Template

```
Persona: <stakeholder role>
Cares about (in order): <item 1>, <item 2>, <item 3>
Accepts: <a cost this stakeholder will pay>
Rejects: <an outcome this stakeholder will not accept>
Model: <sonnet | opus | haiku>
```

The workflow receives each sheet as `{ "name", "criteria", "model" }`. `name` is the Persona line, `model` is the Model line, and `criteria` is the 3 lines in between.

## Example

```
Persona: Maintainer
Cares about (in order): readability, test coverage, number of dependencies
Accepts: slower runtime if the code stays simple
Rejects: any option that needs a specialist to change it
Model: sonnet
```

## Rules per line

| Line | Rule | Evidence |
| --- | --- | --- |
| Persona | Name a stakeholder who lives with the result: "Who lives with the result of this decision?" The 7 names must differ. The name adds no measured faithfulness, but production keeps it, and the report labels each ballot with it. | E3 |
| Cares about | Give 3 items, ranked, most important first. Give no more than 3. 2 items are enough when a third would not separate the options. | E5, E8, E9 |
| Accepts | Name a cost, not a solution. Voters almost never cite this line, so keep it short. | E14 |
| Rejects | Name an outcome, not an option. Voters cite this line as a second kind of argument. | E6, E7 |
| Model | Use `sonnet`, `opus`, or `haiku`. Use at least 2 different models across the 7 sheets. | — |

## Rules for the whole sheet

- **Name no solution approach.** "Cares about latency" is allowed. "Prefers caching" is not.
- **Name no option.** If the user named options, keep them out of every sheet.
- **Name no property that only 1 option has.** "Memory safety" or "a published 5-year support policy" acts as a vote for the option that has it. In the sheet v2 test, 1 such line decided a voter's ballots against its own item order (E11). Step 1 of the skill has this rule.
- **Add no item definitions yet.** Definitions raised adherence but made voters less steady. They are on hold until a sheet-content lint exists (E11; open item 1 in `docs/ideas/2026-11-13-open-items.md`).

## What the voter sees

`voterIdentity` in `council.workflow.js` wraps the sheet in this block, then adds the dossier and the ballot rules:

```
You are a voter on a decision panel. Your persona: <Persona>.
Your criteria sheet:
Cares about (in order): <item 1>, <item 2>, <item 3>
Accepts: <...>
Rejects: <...>
Weigh your items in order: item 1 counts more than item 2, and item 2 more than item 3.
Give up what your Accepts line names before you give up any item.
Rank an option that has what your Rejects line names below the options that do not.
```

The last 3 lines are the priority lines (E10). They name "item 3" even on a 2-item sheet. No test covered that case (open item 3).
