# Council Mode

A Claude Code plugin for decisions that are expensive to reverse and have 3 or more defensible options. Advocates argue each option with evidence, debate under a blind referee, and a frozen panel of 7 personas ranks the options. You approve the frame first and make the final decision last.

- How it works and how data flows, with diagrams: [docs/architecture.md](docs/architecture.md)
- Design: [docs/superpowers/specs/2026-11-11-council-mode-design.md](docs/superpowers/specs/2026-11-11-council-mode-design.md)

## Install

```
/plugin marketplace add C:\Users\marko\source\repos\council-mode
/plugin install council-mode@council-mode
```

## Use

```
/council-mode:council <describe the decision>
```

1. Claude writes a problem statement and a 7-persona panel, and asks you to approve them.
2. The workflow generates options, runs one advocate per option, holds a 2-round debate under a referee, and collects ranked ballots.
3. Claude reports the winner, the pairwise table, the evidence that decided it, and what would change the result.

A run starts 20 or more subagents. With 3 options plus the baseline, expect up to 24 agent calls plus 1 per disputed claim. A run has at most 5 options plus the baseline, so at most 30 agent calls plus 1 per disputed claim.

## Develop

```
npm test
claude plugin validate ./plugins/council-mode
```

Do not run `claude plugin validate --strict`. The plugin sets no `version`, so `--strict` turns the `No version specified` warning into an error.

The workflow script must stay plain JavaScript, start with `export const meta`, and never call `Date.now()`, `Math.random()`, or argless `new Date()`. Helper code lives between the `// --- pure helpers start` and `// --- pure helpers end` markers, which `tests/harness.mjs` loads directly.

Evals: `node evals/invariants.mjs` checks saved runs for free; `node evals/probe.mjs --run-id <id> --budget-usd 5` runs the fake-evidence probe. See [evals/README.md](evals/README.md).
