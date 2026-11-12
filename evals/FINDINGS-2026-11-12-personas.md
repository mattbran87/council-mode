# Findings: persona test pilot, 2026-11-12

Run `2026-11-12-persona1`, script label `1a8ce56/992bd9cd`, on the dossier of `fixtures/2026-11-11-cli-language/`. 63 voter calls and 63 judge calls: 0 failed, 0 invalid, 0 missing. Spend $5.72 of $10 ($3.05 voters, $2.67 judge).

## Summary

A stated preference list makes a voter argue from its stakeholder's priorities. A role description alone does not. Dropping the name from the production prompt did not change faithfulness. Whether the name steadies the vote is still open. Production keeps v2 (name plus criteria).

## Score table

| Version | Tied share | Top criterion used | Rejects violations | Same winner (of 3) | Ranking spread |
| --- | --- | --- | --- | --- | --- |
| v1: name + description | 0.60 | 0.76 | 0.38 | 2.71 | 0.76 |
| v2: name + criteria (production) | 0.85 | 0.86 | 0.48 | 3.00 | 0.38 |
| v3: criteria only | 0.89 | 0.95 | 0.19 | 2.57 | 0.76 |

Verdicts under the decision rule: v2 beats v1; v3 beats v1. v2 and v3 tie: v3's lead in tied share is 0.04, under the 0.10 bar, and its ranking spread is higher.

## What was right

- **Preferences anchor the reasons.** With a criteria sheet, 85–89% of reasons argued from the voter's own priorities, against 60% with a description only.
- **Largest v1 drops.** The team lead (0.33), the nightly-job owner (0.39), and the GIS data steward (0.44) fell furthest. Their priorities are the least obvious from their job titles.
- **The name adds no faithfulness.** v3 scored as well as or better than v2 on all 3 faithfulness measures.
- **Production is the steadiest.** Under v2, every voter picked the same first choice in all 3 repeats.

## What was wrong or limited

- **Ceiling effect.** First choices barely changed across versions, because the C# options dominate this scenario. The versions changed why voters ranked as they did, more than what they ranked.
- **The judge favors v2 and v3 by design.** It scores v1 against a criteria sheet v1 never saw. The real finding is narrower: a role description does not reliably recover the stakeholder's stated priorities.
- **Shared prompt tail.** The vote prompt says "Rank every option by your criteria" in every version. A v1 voter has no criteria sheet, so the wording points to something it lacks.
- **Small samples.** v2's stability lead over v3 comes from 3 voters each changing their first choice once. The 3 v3 voters run on 3 different models.
- **Noisy voter.** The field-data coordinator's lower ranks reshuffle under every version (spread 2.00), so its spread is voter noise, not a version effect.
- **Noisy measure.** The rejects-violation counts are too noisy at 21 ballots per version to read.

## What to improve next

1. **7-language follow-up.** Run the follow-up on a scenario where the winners can change: Python, Rust, C#, C++, Go, Ruby, and JavaScript, on a neutral team.
2. **v2 against v3.** If the follow-up still leaves them tied, rerun only v2 and v3 with 5 repeats to settle whether the name steadies the vote.
3. **Generalize the test.** Make the persona test take any fixture and voters file. Today it is fixed to the first fixture.
