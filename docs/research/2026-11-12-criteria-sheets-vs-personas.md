# Criteria sheets vs. personas: research brief

2026-11-12 · Council Mode research note

## Question

Council Mode's voters get a persona name plus a criteria sheet: ranked "Cares about" items, an "Accepts" line, and a "Rejects" line. Our persona test found that the criteria sheet does the work. Is this a known result, and what does the research say about why?

## Short answer

The parts are known. The exact setting is not.

- **Personas are known to be weak and to flatten people.** A persona in the system prompt does not improve accuracy on objective questions. Persona variables explain little of how real people differ. Persona-prompted models produce answers less diverse than real people, collapse toward group stereotypes, and converge on the same judgments.
- **Explicit values beat identity cues for steering.** The closest study found that conditioning on the few values relevant to each query beat demographic prompting by a wide margin. It also beat handing the model the person's whole value profile.
- **The setting is new.** I found no study that compares a stakeholder criteria sheet with a persona for voters who rank options on a decision panel. Our 2 runs are a small first test of that. They match the literature: faithfulness about 0.9 with a criteria sheet against about 0.55 without, and herding onto the favorite without one.

## Persona and criteria sheet, defined

| | Persona | Criteria sheet |
| --- | --- | --- |
| Tells the model | Who it is: a role, a background, an identity | What to weigh: ranked priorities, plus what it accepts and rejects |
| Preferences come from | The model's inference from the identity, which leans on stereotypes | The sheet itself |
| Typical failure | Collapse toward a group prototype or the consensus answer | A vague or biased sheet gives vague or biased votes |
| Can a judge check a vote against it? | Hard: what should a "team lead" prefer? | Yes: each reason can be matched to a line of the sheet |

A criteria sheet is close to two existing ideas. In LLM research, it is a small, task-relevant **value profile**. In human decision analysis, it is a stakeholder's **explicit objectives**, as in multi-criteria decision analysis and value-focused thinking. The decision-analysis link is from general knowledge; I did not search for it.

## Evidence

### 1. Personas do not reliably change what a model knows

Zheng, Pei, Logeswaran, Lee, and Jurgens tested 162 roles on 2,410 MMLU questions across 4 open model families. They report "no significant differences between the best-performing personas and the control setting". They also found that the effect of any one persona is largely random, and that automatic persona selection often did no better than random. (Findings of EMNLP 2024.) Their first version, from November 2023, had claimed the opposite. The authors reversed it after a larger test.

**Relevance:** low. This paper measures factual accuracy, not preferences. It does show that identity cues are a noisy steering signal.

### 2. Persona variables explain little of how people differ

Hu and Collier found that persona variables explain under 10% of annotation variance on many subjective NLP datasets. They also found that persona prompting helps only when those variables are predictive. 25–70% of variance stayed unexplained by both the text and the persona. The authors suggest that personality and moral and political beliefs carry it. (ACL 2024.)

**Relevance:** high. What separates people's judgments is mostly their beliefs and priorities, not their identity labels. A criteria sheet states the priorities directly.

### 3. Persona-prompted models flatten and collapse

- **Flattening.** Wang, Morgenstern, and Dickerson ran 16 identity groups against 3,200 human participants. "Nearly every single model and identity group across each metric has less diverse LLM responses compared to human responses." GPT-4 and GPT-3.5 covered only about 3 of 5 multiple-choice answers across 100 responses. The mitigations they tried, identity-coded names and higher temperature, reduced the harms but did not remove them. (Accepted at Nature Machine Intelligence, per the arXiv comment.)
- **Caricature.** Cheng, Piccardi, and Yang (EMNLP 2023) measured caricature in persona simulations. Political and marginalized groups, and general topics, were the most prone to it.
- **Persona collapse.** Xiao et al. gave 8 open models 1,144 personas, each built from 26 attributes, and compared the outputs with 2,058 US participants. They report that collapse is "universal but task-dependent", and that "sampling more personas cannot mitigate the collapse". Fine-tuning for role-play made it worse: personality-space coverage fell from 0.47 to 0.16 between Llama-3.1-8B and its role-play variant. (Preprint, 2026, not peer reviewed.)

**Relevance:** high. This is the herding we saw: 20 of 21 described-persona ballots picked Go.

### 4. Explicit, query-relevant values beat identity cues

- **Value profiles.** This is the closest match to a criteria sheet. Poole and Jahanbakhsh steered Llama-3.1-8B toward 152 real users' Schwartz value profiles across 1,501 value-tension scenarios. They measured alignment as Spearman ρ with the user's profile:

  | Condition | ρ |
  | --- | --- |
  | No personalization | 0.131 |
  | Demographics prompt | 0.133 |
  | Full value profile prompt | 0.292 |
  | Top-2 query-relevant values prompt | 0.372 |
  | Top-2 values plus fine-tuning | 0.522 |

  Demographics added almost nothing over no personalization. The authors conclude that personalization depends "less on how much a model knows about a user than on selecting the values relevant to each query". Qwen3-8B showed the same pattern. (Accepted to EMNLP 2026 Main.)
- **Demographic profiles.** Zhong, Li, Sun, and Fan tested 7 models and 1,000 World Values Survey profiles. Demographic profiles pulled answers toward group averages: about 80% of users were "homogenized" for GPT-5.1, DeepSeek-V3, and Qwen2.5-72B, against about 50% for real people. The same attributes spread across a dialogue homogenized less, 43.8% on average. The authors call the mechanism "prototype retrieval": a compact profile cues the model to retrieve a group stereotype. (EMNLP 2026 Findings.)

**Relevance:** very high. A criteria sheet is a short list of query-relevant values, which is the condition that won. A persona is a compact identity cue, which is the condition that triggers prototype retrieval.

**Sourcing caveat:** I read both papers' abstracts and introductions word for word. Most of the result numbers above come from a summary of the later sections. I did not check them against the PDFs.

### 5. Explicit criteria help LLM judges too

Prometheus approached GPT-4's evaluation ability when the model was given a detailed score rubric and a reference answer, with a 0.897 Pearson correlation to human ratings. A separate study found poor agreement with humans when the judge got only "Which is the better response?" The same pattern holds for judges: stated criteria beat open-ended preference.

### 6. Panels lose diversity in other ways too

- **Conformity.** Persona agents in group discussion conformed to perceived peer pressure, and many reverted to their original opinions when asked privately. An explicit instruction to stand firm reduced persona impersonation.
- **Collapse in debate.** Multi-agent debate can suffer "disagreement collapse" and "silent agreement" with the majority.
- **Correlated errors.** A panel of judges with correlated errors gives fewer independent votes than its size suggests. Diverse model families help.

Council Mode already avoids part of this. Voters never see each other's ballots, and the panel mixes haiku, sonnet, and opus.

## Where our results fit

| Our finding | Matching literature |
| --- | --- |
| Criteria sheet: 0.85–0.93 of reasons tied to the voter's priorities; described persona: 0.53–0.60 | Explicit values beat identity cues (section 4); persona variables explain little (section 2) |
| Described personas herded: 20 of 21 picked the favorite in the follow-up | Flattening, collapse, prototype retrieval (sections 3 and 4) |
| The persona name added no faithfulness on top of the criteria | Demographics prompt ≈ no personalization (ρ 0.133 against 0.131) |
| The pilot showed no herding, because its panel split between 2 near-identical favorites | Collapse is task-dependent (Xiao et al.) |

What we add:
- the decision-panel setting, where voters rank options and give reasons
- herding measured across a whole panel
- a blind judge that checks each reason against the voter's own sheet

What we cannot claim:
- **Small samples.** 21 ballots per version per scenario, in 2 synthetic scenarios.
- **No human baseline.** No real stakeholder ranked these options.
- **A favorable judge.** The judge scores a described persona against a sheet it never saw.
- **Shared wording.** Every version's prompt says "by your criteria".

## Design implications for Council Mode

1. **Keep the criteria sheet and keep it short.** In Poole and Jahanbakhsh, 2 query-relevant values beat the full value profile. Three ranked "Cares about" items, written for this decision, is the right shape. Don't make the sheets longer.
2. **Write the sheet from the decision, not from the role.** Step 1 already asks "Who lives with the result?" and bans naming solutions. The research supports going further: each line must matter for this decision, or it is noise.
3. **Keep identity cues out of the sheet.** Demographic and role details trigger prototype retrieval. The name is harmless as a label, but a background story would invite the herding we measured.
4. **Keep voters independent.** No voter sees another's ballot, which avoids the conformity found in group discussions.
5. **Keep mixing models.** Correlated errors shrink a panel's effective size, and mixed models reduce that.

## Open questions and next experiments

1. **Sheet quality ablation.** Test ranked against unranked "Cares about" items, with and without the "Rejects" line, and 2 against 3 against 5 items. This is the gap the literature leaves open, and it tells step 1 how to write sheets.
2. **A neutral prompt tail.** Rerun v1 with "Rank every option" so the wording doesn't point to criteria it lacks.
3. **A human baseline.** Ask 5–7 real engineers to fill in a criteria sheet and rank the follow-up's options. Then compare their rankings with the criteria-sheet voters'. This is the only way to test fidelity to real people, not just to the sheet.
4. **More scenarios.** At least 3 more, including one with no clear favorite and one outside software.

Is it worth writing up? Not yet. The direction matches published work, and the decision-panel setting looks new. A credible write-up needs experiments 1, 3, and 4 first.

## Sources

- Zheng, Pei, Logeswaran, Lee, Jurgens. [When "A Helpful Assistant" Is Not Really Helpful: Personas in System Prompts Do Not Improve Performances of LLMs](https://arxiv.org/abs/2311.10054). Findings of EMNLP 2024.
- Hu, Collier. [Quantifying the Persona Effect in LLM Simulations](https://arxiv.org/abs/2402.10811). ACL 2024.
- Wang, Morgenstern, Dickerson. [LLMs that replace human participants can harmfully misportray and flatten identity groups](https://arxiv.org/abs/2402.01908). Nature Machine Intelligence (per arXiv).
- Cheng, Piccardi, Yang. [CoMPosT: Characterizing and Evaluating Caricature in LLM Simulations](https://aclanthology.org/2023.emnlp-main.669). EMNLP 2023.
- Xiao, Zhang, Yang, Xuan, Huang. [The Chameleon's Limit: Investigating Persona Collapse and Homogenization in LLMs](https://arxiv.org/abs/2604.24698). Preprint, 2026.
- Poole, Jahanbakhsh. [Personalized Alignment of Language Models with Human Value Profiles](https://arxiv.org/abs/2611.09919). EMNLP 2026 Main.
- Zhong, Li, Sun, Fan. [Alignment by Stereotyping: How LLMs Sacrifice Individual Distinctiveness for Cultural Adaptation](https://arxiv.org/abs/2609.05993). EMNLP 2026 Findings.
- [VISTA: Steering LLMs with Latent User Values Inferred from a Few Survey Answers](https://arxiv.org/html/2610.23702). Preprint.
- Kim et al. [Prometheus: Inducing Fine-grained Evaluation Capability in Language Models](https://arxiv.org/abs/2310.08491).
- [Ranking Large Language Models without Ground Truth](https://arxiv.org/abs/2402.14860).
- [Persona Inconstancy in Multi-Agent LLM Collaboration: Conformity, Confabulation, and Impersonation](https://arxiv.org/abs/2405.03862).
- Liang et al. [Encouraging Divergent Thinking in LLMs through Multi-Agent Debate](https://arxiv.org/abs/2305.19118).
- [Diversity Collapse in Multi-Agent LLM Systems](https://arxiv.org/abs/2604.18005). Preprint.
- [Who can we trust? LLM-as-a-jury for Comparative Assessment](https://arxiv.org/html/2602.16610v1).
- [JuryProbe: correlated errors in judge panels](https://arxiv.org/abs/2608.20607). Preprint.
- Council Mode results: `evals/FINDINGS-2026-11-12-personas.md`.
