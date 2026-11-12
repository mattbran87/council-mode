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
