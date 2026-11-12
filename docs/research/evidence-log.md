# Evidence log

One entry per finding about how Council Mode's voters, sheets, and debate behave. Each entry names its source run, its strength, and the decision it supports. Add a new entry for each finding; when a later run confirms or contradicts an entry, update its **Status** line and link the new run. Do not delete entries.

**Strength scale.**
- **Strong:** replicated across at least 2 scenarios, or a large effect that passed its pre-set bar.
- **Moderate:** a pre-set bar passed once, or a consistent direction across runs that never reached a bar.
- **Weak:** a single observation, or an effect under its bar; a lead to test, not a basis for a change.

Background research: `docs/research/2026-11-12-criteria-sheets-vs-personas.md`.

| ID | Finding | Strength | Source | Decision | Status |
| --- | --- | --- | --- | --- | --- |
| E1 | A criteria sheet keeps a voter's reasons on its stated priorities: 0.85–0.93 of reasons tied, against 0.53–0.60 for a role description with no sheet. | Strong (2 scenarios, passed the 0.10 bar both times) | Persona test: `2026-11-12-persona1`, `2026-11-12-persona-5lang`; `evals/FINDINGS-2026-11-12-personas.md` | Keep criteria sheets on every voter. | Matches published work on value profiles versus demographics. |
| E2 | Without a sheet, a panel herds onto the favorite: 20 of 21 described-persona ballots picked Go, against 15 of 21 with a sheet. | Moderate (1 scenario with a clear favorite; the pilot had none) | `2026-11-12-persona-5lang` | Keep criteria sheets; they hold each stakeholder's own pull. | Matches published work on persona flattening and collapse. |
| E3 | The persona name adds no faithfulness on top of a criteria sheet: name plus sheet 0.85 and 0.93, sheet alone 0.89 and 0.91. | Moderate (2 scenarios, no difference either time) | Persona test, both runs | Keep the name (production v2); dropping it showed no gain. | The name's effect on stability is unclear: v2 had the lowest ranking spread in both runs, but its same-winner lead did not repeat. |
| E4 | The sheet's details matter much less than having a sheet: all 5 sheet variants kept 0.87–0.93 of reasons on the voter's own lines. | Moderate (1 scenario; no adherence gap passed the 0.10 bar) | Sheet test: `2026-11-12-sheets1`; `evals/FINDINGS-2026-11-12-sheets.md` | Template changes are low risk; judge them on diversity and stability, not adherence. | Open. |
| E5 | Ranked items let a stakeholder's top priority decide its vote. The platform team maintainer picked JavaScript 3 times out of 3 with ranked items, and Go 3 times out of 3 unranked. The top first-choice share rose from 0.86 to 1.00, under the 0.15 bar. | Weak (1 voter, under the bar) | `2026-11-12-sheets1`, S1 against S0 | Keep ranked "Cares about" items in the template (user, 2026-11-12). | To test: S0 against S1 with more repeats, and voters whose top item favors a non-favorite option. |
| E6 | The Accepts and Rejects lines give voters a second kind of argument: 19 of 105 reasons argued from the Rejects line with it, 3 of 105 without. Without the lines, the panel herded completely: top first-choice share rose from 0.86 to 1.00. | Weak (1 scenario; the herding comes from 1 voter, under the 0.15 bar) | `2026-11-12-sheets1`, S2 against S0 | Keep the Accepts and Rejects lines in the template (user, 2026-11-12). | Open. |
| E7 | Showing a voter its Rejects line did not lower judge-flagged violations: 0.52 per ballot with the line, 0.62 without. | Weak (under the 0.5 bar) | `2026-11-12-sheets1`, S2 against S0 | None yet. | To test: read S0's flagged violations by hand, to tell real overrides from judge over-flagging. |
