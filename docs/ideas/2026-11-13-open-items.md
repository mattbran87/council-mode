# Open items after the sheet v2 test

Status on 2026-11-13, with `main` at 224e5b8. Sources: `evals/FINDINGS-2026-11-12-sheet-v2.md`, `evals/FINDINGS-2026-11-12-sheets.md`, `evals/FINDINGS-2026-11-12-personas.md`, and `docs/research/evidence-log.md`.

The user will discuss items 1, 2, 3, and 5 one at a time before any decision.

**Recommended first step:** the hand check of Rejects violations (item 5). It costs nothing. It also tells us whether to trust the violation numbers in 3 runs, and test 4 rests on those numbers.

## A. Decisions waiting on the user

### 1. Hold item definitions until a sheet-content lint exists

- **What it is.** V1 gave each "Cares about" item a "serves" and a "fails" definition.
- **What happened.** Adherence rose from 0.84 to 0.94. Ranking spread also rose, from 0.95 to 1.62, so voters gave less steady answers to identical input.
- **Cause.** A hand check found one definition that acts as a property proxy (it names a trait that only one option has). The Engineering manager's item 3 says "published support policy that covers 5 years." C# has one; Go does not. That line decided every C#-first ballot, against the voter's own item order.
- **What "hold" means.** Production keeps sheets without definitions. A lint (an automatic check of sheet text) would flag any definition that names a trait of one option. After the lint exists, we rerun V1 (item 6).
- **The alternative.** Adopt definitions now and accept the noise. Recommended against: production calls each voter once, so a noisy voter adds random votes.
- **Evidence log:** E11.

### 2. Do not adopt assessment-first

- **What it is.** V3 had each voter write a short note on every option before it ranked them.
- **What happened.** No measure passed its bar. Voter calls cost 18% more and took 30% longer.
- **Likely cause.** The ballot already asks for one reason per adjacent pair, so voters reason before they finish anyway.
- **What "do not adopt" means.** Production stays as it is, so no code changes. Record the decision in the findings file and the evidence log.
- **Evidence log:** E12.

## B. A known gap in production

### 3. The priority lines assume 3 items

- **What it is.** The production line reads: "item 1 counts more than item 2, and item 2 more than item 3." Step 1 of the skill allows a 2-item sheet. On such a sheet, the line names an item that does not exist.
- **Risk.** The effect is unknown. A voter could ignore it, or could treat its Rejects or Accepts line as item 3. No test covered this case.
- **Fix options:**
  - Reword the line so that it fits any count: "Each item counts more than the items below it." This is cheap, but the reworded line was never tested.
  - Build the line from the item count in `voterIdentity`. This keeps the tested wording for 3 items, but the criteria arrive as free text, so the code must count the items.
- **Lean.** Build the line from the count, so the 3-item case keeps the exact wording that V2 tested.

## C. Next tests from the sheet v2 findings

### 4. Rerun V0 against V2 and V4 with more repeats (paid)

- **Why.** V2 cut Rejects violations from 0.57 to 0.24 per ballot, and V4 cut them to 0.14. Neither gap reached the 0.5 bar. With 21 ballots per version, only large effects show.
- **Cost.** About $10 at 6 repeats, estimated from the cost per version in `2026-11-12-sheets2-1`. It rises with more repeats.
- **Dependency.** Run it after item 5. If the judge over-flags violations, more repeats only measure the judge more precisely.

### 5. Read the flagged Rejects violations by hand (free)

- **Why.** Every violation number comes from 1 judge model, and no one has checked its flags. E7 asked for this check after the first sheet run, so it is now open across 3 runs.
- **Method.** Read the saved judge output for V0, V2, and V4 in `2026-11-12-sheets2-1`, and for S0 in `2026-11-12-sheets1`. Sort each flag into one of 3 groups: a real override, judge over-flagging, or unclear.
- **Outcome.** If most flags are real, the V2 gain holds and item 4 is worth paying for. If most are noise, the violation measure needs a fix first.

### 6. Rerun V1 after a content lint (paid, needs build work first)

- Build the lint, rewrite the definitions it flags, then rerun V1 against V0.
- This test decides item 1. If spread stays low with clean definitions, definitions go into production.

### 7. Remove only the Accepts line (paid)

- **Why.** The judge tied 0 of 525 reasons in `2026-11-12-sheets2-1` to the Accepts line, and 3 in all earlier runs together (E14).
- **Open question.** Either the line works as a silent trade-off, or it does nothing. The judge cannot see a silent trade-off, so only a removal test can tell. If rankings stay the same without it, sheets get shorter and easier to write.
- **Note.** One V2 priority line names the Accepts line: "Give up what your Accepts line names before you give up any item." A removal test must also drop that line.

## D. Older open items

### 8. A scenario with no clear favorite (paid, needs a new fixture)

- In both fixtures, one option is far ahead (Go won the 5-language scenario), so only 1 or 2 voters can show diversity. Every diversity result rests on that small number.
- A fixture with close options would test whether sheets keep voters apart when the dossier does not push them together.

### 9. S0 against S1 with more repeats (paid)

- S1 used the same items as S0, but unranked. The Platform team maintainer picked JavaScript 3 of 3 times with ranked items, and Go 3 of 3 times with unranked items. The gap in top first-choice share was 0.14, just under the 0.15 bar.
- The plan was 5 repeats, plus voters whose top item favors an option other than the favorite.
- This matters less now. V2 tells voters the order outright, so ranking is fixed in production either way.

### 10. The 7-language scenario (dropped)

- Python, Rust, C#, C++, Go, Ruby, and JavaScript, on a neutral team, so that the winner can change.
- **Conflict.** Production caps options at 5. A 7-option fixture needs a hand-built dossier or a cap bypass in the eval, so it would not test real production behavior.
- **Decision (user, 2026-11-13).** Drop it. Item 8, a 5-option scenario with no clear favorite, covers the same need ("winners can change") inside the cap.

## Housekeeping

- The worktree `.claude/worktrees/feat-initial-build` and its branch `worktree-feat-initial-build` from the first build are still on disk.
