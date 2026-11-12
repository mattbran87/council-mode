# Findings: sheet-quality pilot, 2026-11-12

Run `2026-11-12-sheets1`, under script label `1a8ce56/df5a3305/2026-11-12-cli-5lang`, on the dossier of `fixtures/2026-11-12-cli-5lang/`. It made 105 voter calls and 105 judge calls: 0 failed, 0 invalid, and 0 missing. It spent $7.75: $4.25 on voters and $3.50 on the judge. Design: `docs/superpowers/specs/2026-11-12-council-mode-sheet-test-design.md`.

## Summary

The sheet's details matter much less than having a sheet. All 5 versions kept 0.87–0.93 of reasons on the voter's own lines. In the persona test, a role description with no sheet kept 0.53–0.60. Only 2 differences from S0 passed their bar, and both have a mechanical cause (see S2 and S3).

## Score table

| Version | Adherence | Coverage | Top-item weight | Rejects violations | Same winner (of 3) | Ranking spread | Top first-choice share |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S0, production | 0.93 | 0.94 | 0.52 | 0.52 | 3.00 | 0.48 | 0.86 |
| S1, unranked | 0.87 | 0.90 | 0.47 | 0.57 | 3.00 | 0.67 | 1.00 |
| S2, no Accepts or Rejects | 0.88 | 0.93 | 0.66 | 0.62 | 3.00 | 0.48 | 1.00 |
| S3, top 2 items | 0.89 | 0.90 | 0.67 | 0.52 | 2.86 | 0.38 | 0.81 |
| S4, 5 items | 0.87 | 0.87 | 0.57 | 0.57 | 2.57 | 1.05 | 0.81 |

Differences that passed their bar: S2 top-item weight +0.14, and S3 top-item weight +0.15.

First choices per voter, over 3 repeats:

| Voter | S0 | S1 | S2 | S3 | S4 |
| --- | --- | --- | --- | --- | --- |
| Everyday engineer user | Go ×3 | Go ×3 | Go ×3 | Go, Go, Rust | Go, Rust, Go |
| Platform team maintainer | **JS ×3** | Go ×3 | Go ×3 | **JS ×3** | Go, JS, JS |
| Future new hire | Go ×3 | Go ×3 | Go ×3 | Go ×3 | Go ×3 |
| Release engineer | Go ×3 | Go ×3 | Go ×3 | Go ×3 | Go ×3 |
| Security engineer | Go ×3 | Go ×3 | Go ×3 | Go ×3 | Go ×3 |
| Developer-experience support lead | Go ×3 | Go ×3 | Go ×3 | Go ×3 | Go ×3 |
| Engineering manager | Go ×3 | Go ×3 | Go ×3 | Go ×3 | Go, C#, Go |

## S1: unranked items

**Result.**
- **Adherence:** 0.93 → 0.87.
- **Top-item weight:** 0.52 → 0.47.
- **Top first-choice share:** 0.86 → 1.00. That gap is 0.14, just under the 0.15 bar.
- **Ranking spread:** 0.48 → 0.67.

No difference passed its bar.

**What it shows.** Ranking decided the one minority pick in the run. The platform team maintainer's #1 item is "speed of adding commands". With ranked items, it picked JavaScript 3 times out of 3. With the same items unranked, it picked Go 3 times out of 3. Adherence stayed high without ranking, so voters still argue from an unranked sheet. They just weigh it differently. Top-item weight barely moved, so voters may infer importance from the items themselves.

**Limits.**
- The diversity effect rests on 1 voter.
- The seeded shuffle left the engineering manager's items in their original order, so for that voter S1 differs from S0 only in the words "in no particular order".
- First choices vary between runs. The same production sheet gave Go 15, JS 3, C# 2, and Rust 1 in the persona run (`2026-11-12-persona-5lang`), and Go 18 with JS 3 here.

**Decision (user, 2026-11-12).** Keep ranked "Cares about" items in the template. Ranking costs nothing, and it was the only change that erased a minority pick. Evidence log: E5.

## S2: no Accepts or Rejects lines

**Result.**
- **Adherence:** 0.93 → 0.88.
- **Top-item weight:** 0.52 → 0.66. This passed its bar.
- **Rejects violations per ballot:** 0.52 → 0.62, far under the 0.5 bar.
- **Top first-choice share:** 0.86 → 1.00.

The judge tied 19 of 105 reasons to the Rejects line under S0, and 3 of 105 under S2.

**What it shows.** The Accepts and Rejects lines give voters a second kind of argument: what they rule out. Without the lines, those reasons moved to the voter's #1 item. That move is the whole of the top-item weight gain, so the passed bar is mechanical and does not mean voters weighed their priorities better. Removing the lines erased the same minority pick that S1 erased: the platform team maintainer (Rejects: "a codebase only 1 team member can change") went from JavaScript 3 times out of 3 to Go 3 times out of 3. That pick needed both the ranking and the limits.

**Open question.** The Rejects line did not prevent violations. Voters who saw it still ranked an option the judge read as breaking it above one that didn't, about once every 2 ballots. This run cannot tell whether voters override their own limit when other evidence is strong, or whether the judge flags too freely.

**Decision (user, 2026-11-12).** Keep the Accepts and Rejects lines in the template. Evidence log: E6 and E7.

## S3: top 2 items

**Result.**
- **Adherence:** 0.93 → 0.89.
- **Coverage:** 0.94 → 0.90.
- **Top-item weight:** 0.52 → 0.67. This passed its bar.
- **Ranking spread:** 0.48 → 0.38.
- **Top first-choice share:** 0.86 → 0.81, the most diverse of the 5 versions.

Voters argued from item 3 in 11 of 105 reasons when the sheet showed it, and in 1 when it didn't.

**What it shows.** A 2-item sheet loses little. Coverage fell by 0.04, and S3 kept the minority pick: the platform team maintainer picked JavaScript 3 times out of 3. This agrees with the value-profile study, where 2 query-relevant values beat a full profile. The passed top-item weight bar is mechanical: with 2 items, more "Cares about" reasons land on item 1 because there are fewer items to spread across. S3's small leads in stability and diversity are under their bars.

**Decision (user, 2026-11-12).** Keep 3 items as the default. Step 1 of the skill now says: "Give 3 ranked "Cares about" items. 2 is enough when a third item would not separate the options." Evidence log: E8.

## S4: 5 items

**Result.**
- **Adherence:** 0.93 → 0.87.
- **Coverage:** 0.94 → 0.87.
- **Same winner:** 3.00 → 2.57, the least stable version.
- **Ranking spread:** 0.48 → 1.05, more than double.

Items 4 and 5 carried 10 of 105 reasons, and 14 of 105 reasons tied to no line, against 6 under S0. No difference passed a bar: the decision rule set none for stability.

**What it shows.** Voters used the extra items rarely, and the longer sheet made them less steady. 3 voters changed their first choice between repeats:
- the everyday engineer user: Go, Rust, Go
- the platform team maintainer: Go, JS, JS
- the engineering manager: Go, C#, Go

No voter did under S0. A longer list seems to blur what the voter weighs.

**Decisions (user, 2026-11-12).**
- **Cap at 3 items.** Step 1 of the skill now says: "Give 3 ranked "Cares about" items, and no more than 3. 2 is enough when a third item would not separate the options."
- **Add a ranking-spread bar.** A bar of 0.5 for ranking spread joins the decision rule, from the next run onward. It is not applied after the fact to this run, so this file's verdicts stand as written. A later re-render of this run's report would list the S4 spread gap (+0.57) under the new bar.

Evidence log: E9.

## Template recommendation

Keep the template as it is, with the rules above made explicit:

```
Persona: <stakeholder>
Cares about (in order): <item 1>, <item 2>, <item 3>
Accepts: <what this stakeholder will trade away>
Rejects: <what this stakeholder rules out>
Model: <model>
```

- **Ranked items.** Ranking decided the run's only minority pick (E5).
- **Accepts and Rejects lines.** They carry about 1 reason in 5 and kept that same minority pick (E6).
- **3 items, at most.** 2 is enough when a third would not separate the options (E8). 5 made voters less steady (E9).

## Limits

- **One scenario.** It has 1 clear favorite, and only 1 voter made a minority pick under the production sheet, so the diversity results rest on that voter.
- **Small samples.** 21 ballots per version: only large effects show.
- **One judge.** The judge is the only rater, and Rejects-violation flags are unchecked (E7).

## What to test next

1. **S0 against S1 with more repeats.** Use 5 repeats, with voters whose top item favors a non-favorite option.
2. **Rejects violations by hand.** Read S0's flagged violations to tell real overrides from judge over-flagging. This needs no new calls.
3. **A scenario with no clear favorite.** That tests sheets where diversity has room to show.
