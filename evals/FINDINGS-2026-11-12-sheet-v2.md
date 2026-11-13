# Findings: sheet v2 test, 2026-11-12

Run `2026-11-12-sheets2-1`, under script label `1a8ce56/59d009ab/2026-11-12-cli-5lang`, on the dossier of `fixtures/2026-11-12-cli-5lang/`. It made 105 voter calls and 105 judge calls: 0 failed, 0 invalid, and 0 missing. It spent $8.41: $4.78 on voters and $3.63 on the judge. Design: `docs/superpowers/specs/2026-11-12-council-mode-sheet-v2-test-design.md`. Background: `docs/research/prompt-structures.md`.

## Summary

The 3 priority lines (V2) are the only part with a gain and no cost, and production now uses them. Item definitions (V1) raised adherence but made voters less steady, because one definition favored one option. Writing an assessment first (V3) moved no measure. All 3 together (V4) gave the most diverse panel and the fewest Rejects violations.

## Score table

| Version | Adherence | Top-item weight | Rejects violations | Same winner (of 3) | Ranking spread | Top first-choice share | Assessment coverage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| V0, production before this test | 0.84 | 0.65 | 0.57 | 2.71 | 0.95 | 0.86 | n/a |
| V1, + definitions | 0.94 | 0.58 | 0.43 | 2.57 | 1.62 | 0.81 | n/a |
| V2, + priority lines | 0.94 | 0.66 | 0.24 | 2.71 | 0.86 | 0.76 | n/a |
| V3, + assessment first | 0.90 | 0.60 | 0.52 | 2.71 | 0.95 | 0.86 | 1.00 |
| V4, all 3 | 0.93 | 0.62 | 0.14 | 2.57 | 1.24 | 0.67 | 1.00 |

Differences that passed their bar: V1 adherence +0.10, V1 ranking spread +0.67, V2 adherence +0.10, and V4 top first-choice share −0.19.

Reasons by the line the judge tied them to, out of 105 per version:

| Version | cares1 | cares2 | cares3 | accepts | rejects | none |
| --- | --- | --- | --- | --- | --- | --- |
| V0 | 47 | 19 | 6 | 0 | 16 | 17 |
| V1 | 52 | 23 | 14 | 0 | 10 | 6 |
| V2 | 52 | 19 | 6 | 0 | 22 | 6 |
| V3 | 45 | 23 | 6 | 0 | 21 | 10 |
| V4 | 52 | 18 | 14 | 0 | 14 | 7 |

First choices per voter, in repeat order:

| Voter | V0 | V1 | V2 | V3 | V4 |
| --- | --- | --- | --- | --- | --- |
| Everyday engineer user | Go, Rust, Go | Go, C#, Go | Go, Go, Rust | Go ×3 | Go, Rust, Rust |
| Platform team maintainer | JS, Go, JS | JS, Go, Go | **JS ×3** | JS, Go, JS | **JS ×3** |
| Future new hire | Go ×3 | Go ×3 | Go ×3 | Go ×3 | Python, Go, Go |
| Release engineer | Go ×3 | Go ×3 | Go ×3 | Go ×3 | Go ×3 |
| Security engineer | Go ×3 | Go ×3 | Go ×3 | Go ×3 | Go ×3 |
| Developer-experience support lead | Go ×3 | Go ×3 | Go ×3 | Go ×3 | Go ×3 |
| Engineering manager | Go ×3 | Go, C#, C# | C#, Go, Go | Go, Go, C# | C#, Go, Go |

Voter-call cost and time, 21 calls per version:

| Version | Cost | Average time per call |
| --- | --- | --- |
| V0 | $0.89 | 18.0 s |
| V1 | $0.89 | 19.5 s |
| V2 | $0.89 | 20.2 s |
| V3 | $1.05 | 23.4 s |
| V4 | $1.06 | 25.9 s |

## V1: item definitions

**Result.**
- **Adherence:** 0.84 → 0.94. This passed its bar.
- **Ranking spread:** 0.95 → 1.62. This passed its bar, in the bad direction.
- **Top-item weight:** 0.65 → 0.58, under its bar.
- Reasons tied to item 3 rose from 6 to 14 of 105, and reasons tied to no line fell from 17 to 6.

**What it shows.** Definitions give voters words to argue from, so fewer reasons fall outside the sheet. But they also make lower items stronger, and 1 voter's definition decided its vote against its own order.

The engineering manager drives most of the spread cost: 4.00 against 0.67 under V0. A hand check of its 9 ballots under V0, V1, and V4 found the cause:
- Go and C# are close on items 1 and 2. The ballots say "staffing is roughly equal" and "Both have a bus factor of 1."
- The item-3 definition favors C#: "The toolchain has a published support policy that covers 5 years." C# has a published LTS cadence; Go has a compatibility promise.
- Every C#-first ballot rested on item 3 (`cares3`), and every Go-first ballot on item 1 (`cares1`). Under V0, all 3 repeats picked Go on item 1.

So the definition acts as a property proxy, like the "memory safety" item: it names a property that one option has. Voting C# first also breaks the voter's own order, because item 3 decides over item 1.

**Recommendation (not yet decided).** Hold definitions until a sheet-content lint can catch definitions that favor one option. Evidence log: E11.

## V2: priority lines

**Result.**
- **Adherence:** 0.84 → 0.94. This passed its bar.
- **Rejects violations per ballot:** 0.57 → 0.24, a gap of 0.33, under the 0.5 bar.
- **Ranking spread:** 0.95 → 0.86, the steadiest version.
- **Top first-choice share:** 0.86 → 0.76.
- Reasons tied to no line fell from 17 to 6, and reasons tied to the Rejects line rose from 16 to 22.
- Cost per voter call did not change.

**What it shows.** Telling voters how to weigh the sheet ties more reasons to it and lowers violations, with no measure getting worse. The platform team maintainer picked JavaScript 3 times out of 3 under V2, against 2 of 3 under V0, so its top item held.

**Decision (user, 2026-11-12).** Add the 3 lines to the production voter prompt, inside `voterIdentity`, after the sheet (commit d1dc0fe). The persona, sheet, and sheet v2 tests keep the identity they ran with (`identityBefore` in `evals/lib/persona-core.mjs`), so they stay reproducible. Evidence log: E10.

## V3: assessment first

**Result.** No difference passed a bar. Adherence rose from 0.84 to 0.90, and every other measure stayed within 0.05 of V0. Every judged ballot had a note for every option. Voter calls cost 18% more and took 30% longer.

**What it shows.** Reasoning before the decision helps rubric judges (Prometheus), but it did not help these voters. One possible cause: the ballot already asks for a reason per pair, so the voter reasons before it finishes anyway.

**Recommendation (not yet decided).** Do not adopt it. Production does not use it today. Evidence log: E12.

## V4: all 3

**Result.**
- **Top first-choice share:** 0.86 → 0.67. This passed its bar.
- **Rejects violations per ballot:** 0.57 → 0.14, a gap of 0.43, under the 0.5 bar.
- **Adherence:** 0.84 → 0.93, under its bar.
- **Ranking spread:** 0.95 → 1.24, under its bar. The engineering manager's spread was 4.00, as in V1.

**What it shows.** The 3 parts together gave the most diverse panel: 4 voters picked something other than Go at least once. They also gave the fewest violations. The spread cost comes from the definitions, as in V1. One V4 repeat of the engineering manager still let item 3 decide over item 1, so the priority lines reduce that order violation but do not stop it.

**Decision.** None beyond V2's. Evidence log: E13.

## A pattern across runs: the Accepts line is almost never an argument

The judge tied 0 of 525 reasons in this run to the Accepts line. Earlier runs show the same: 0 in `2026-11-12-sheets1`, 2 in `2026-11-12-persona-5lang`, and 1 in `2026-11-12-persona1`. Voters argue from their items and their Rejects line. If the Accepts line works at all, it works as a silent trade-off, and the judge cannot see that. Evidence log: E14.

## Limits

- **One scenario.** It has 1 clear favorite (Go), so diversity results rest on a few voters.
- **Small samples.** 21 ballots per version: only large effects show.
- **One judge.** The violation drops in V2 and V4 come from judge flags, which no one has checked by hand (E7).
- **A ceiling.** V0 adherence was already 0.84, so a gain of 0.10 is close to the largest this test could show.
- **The V0 baseline moved.** The same production sheet gave adherence 0.93 and ranking spread 0.48 in `2026-11-12-sheets1`, against 0.84 and 0.95 here. Compare versions within one run only.
- **The priority lines assume 3 items.** Step 1 of the skill allows 2 items, and the second line still names "item 3". This was not tested.

## What to test next

1. **V0 against V2 and V4 with more repeats.** It tests whether the violation drop passes the 0.5 bar.
2. **Rejects violations by hand.** Read the flagged violations of V0, V2, and V4 to tell real overrides from judge over-flagging. This needs no new calls.
3. **Definitions after a content lint.** Rewrite the definitions that favor one option, then rerun V1.
4. **The Accepts line.** Test whether removing only the Accepts line changes rankings, since no reason argues from it.
