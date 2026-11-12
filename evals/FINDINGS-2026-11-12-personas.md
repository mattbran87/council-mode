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

# Follow-up: 5-language scenario, 2026-11-12

The follow-up council run (`wf_f85173db-8a6`, saved as `fixtures/2026-11-12-cli-5lang/`) compared Python, Rust, Go, C#, and JavaScript on a mixed-skill team. Shell scripts were the baseline. Go won by Condorcet (Borda 33, against 22 for C#), using 45 agents and about 2.1M tokens.

The persona test then ran on that dossier as run `2026-11-12-persona-5lang`, under script label `1a8ce56/20dd0e31/2026-11-12-cli-5lang`. It made 63 voter calls and 63 judge calls: 0 failed and 0 invalid. It spent $4.79 ($2.58 on voters, $2.21 on the judge).

## Score table, both scenarios

| Version | Tied share | Top criterion used | Same winner (of 3) | Ranking spread | Distinct first choices | Top first-choice share |
| --- | --- | --- | --- | --- | --- | --- |
| v1, pilot / follow-up | 0.60 / 0.53 | 0.76 / 0.90 | 2.71 / 2.86 | 0.76 / 0.95 | 4 / 2 | 0.52 / 0.95 |
| v2, pilot / follow-up | 0.85 / 0.93 | 0.86 / 1.00 | 3.00 / 2.71 | 0.38 / 0.76 | 3 / 4 | 0.43 / 0.71 |
| v3, pilot / follow-up | 0.89 / 0.91 | 0.95 / 0.95 | 2.57 / 2.86 | 0.76 / 0.95 | 4 / 3 | 0.48 / 0.76 |

The verdicts were the same in both runs: v2 beats v1, v3 beats v1, and v2 and v3 tie.

## Conclusion

- **The preference list is what matters.** Across 2 scenarios, a criteria sheet kept about 0.85–0.93 of reasons on the voter's own priorities. A described persona kept 0.53–0.60.
- **A described persona herds.** When the scenario had a clear favorite, 20 of 21 v1 ballots picked it (Go). With criteria, stakeholders split where their priorities say they should: the platform maintainer picked JavaScript, the engineering manager leaned C#, and the support lead leaned Rust under v3. The pilot showed no herding, because its panel split between 2 C# options under every version.
- **The name adds no faithfulness.** v2 and v3 were within 0.04 in both runs. v2 had the lowest ranking spread in both runs, but its same-winner lead in the pilot did not repeat.
- **Decision.** Production keeps v2 (name plus criteria). The criteria sheet is the part to protect: step 1 of the skill must keep writing explicit "Cares about", "Accepts", and "Rejects" lines from the stakeholders.

## Limits

- The judge scores v1 against a criteria sheet v1 never saw, so v1 faithfulness means "recovered the stated priorities".
- The shared prompt tail says "by your criteria" in every version, including v1.
- 21 ballots per version per scenario; rejects-violation counts are too noisy to rank versions.
- v1's stability is inflated by herding: a voter that always picks the favorite always repeats its winner.

## What to improve next

1. A neutral prompt tail for v1 ("Rank every option"), if the persona test is rerun.
2. v2 against v3 with 5 repeats, only if a shorter voter prompt becomes worth having.
