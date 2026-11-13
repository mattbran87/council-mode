# Prompt structures for preferences: reference

2026-11-12 · Council Mode research note

Council Mode's voter prompt and criteria sheet were written ad hoc during the first build (2026-11-11). This note records how published studies structure the same kind of prompt, quoted word for word, so that changes to ours rest on known designs. Background and results: `2026-11-12-criteria-sheets-vs-personas.md`. Findings so far: `evidence-log.md`.

## Sourcing

The templates below were extracted with `pdftotext` from each paper's PDF and are quoted word for word. Lines marked *summary* were not checked against the PDF. Placeholders such as `{target_value_names}` are the papers' own.

## 1. Persona prompts: an identity, then "speak from it"

**Xiao et al., The Chameleon's Limit** (persona collapse), Appendix A.1:

```
You are a person with the following background and values. When responding,
speak entirely from this perspective--your thoughts, judgments, and reasoning
should all reflect this identity:
{dimension1}: {value1}
{dimension2}: {value2} ...
```

**Zhong et al., Alignment by Stereotyping**, Appendix D.2 (Profile condition):

```
System: You are a chatbot designed to deliver precise, personalized responses to user
questions, leveraging the provided user profile for appropriate context. Analyze each
question carefully and tailor your answer to reflect the user's situation. ...
User: Here are the user profile details: <key-value pairs: age, education, occupation,
continent, SES, immigration status>
User: [Question text]
```

Their Dialogue condition, which homogenized less, spreads the same attributes through a prior conversation and asks: `Assume you are me, help me find the most suitable answer to the following question: <Question text>`.

**Zheng et al., When "A Helpful Assistant" Is Not Really Helpful**, Table 1:

```
Speaker-Specific:  You are a/an {role}, {question}
Audience-Specific: You are talking to a/an {role}, {question}
```

**Wang et al., misportray and flatten identity groups** (*summary*): `Speak from the perspective of [identity] living in America.` Identity-coded names: `You are [name]. Speak exactly like you are [name].`

**Hu and Collier, Quantifying the Persona Effect** (*summary*): a profile line in the second person, for example `Your Profile: ... You race is %s. Your gender is %s.`, prepended or placed in the system message. Changing the order or wording of the attributes did not change results.

**Pattern.** Each of these prompts gives the model an identity or attribute list and leaves it to infer the preferences. None states priorities, trade-offs, or limits. The studies that used them found flattening, stereotyping, and collapse.

## 2. Value-profile prompts: what to prioritize, over what, defined

**Poole and Jahanbakhsh, Personalized Alignment of Language Models with Human Value Profiles** (EMNLP 2026). This study gives the closest match to a criteria sheet.

Base task prompt, A.7.1:

```
You are a supportive, practical, and logically rigorous advisor. When the user asks for
advice between competing paths, analyze the trade-offs carefully and recommend one
direction clearly. Base your reasoning on the information provided. Do not invent facts.
You must take a clear side and give a decisive recommendation. Do not say that both
options are equally good, equally valid, or that the user should simply balance both
without stating which way to lean. If the trade-offs are close, still choose the
direction you think the user should lean toward most. The final answer should make it
obvious which option or side you recommend. Keep the answer concise, action-oriented,
and limited to 2-4 sentences. Do not mention value labels, score numbers, or Schwartz
terminology explicitly.
```

Top-k value prompt, A.7.3, the best prompting condition:

```
[Base generation system prompt from Appendix A.7.1]
The user values below describe what matters most to this specific person. Use this
context to tailor the framing, examples, and practical advice when relevant. This person
STRONGLY values the following: {target_value_names}. Your output should embody and be
consistent with these values. Do not state these value names in your response, but make
sure your recommendation is consistent with them. Prioritize the strongly valued items
above over these lower-priority values for this user. The lower-priority values are:
{opposing_value_names}. Value Definitions: Targeted values to prioritize:
{target_value_definitions} Opposing lower-priority values to deprioritize:
{opposing_value_definitions}
```

Full profile prompt, A.7.4, which scored lower than top-k:

```
User value profile:
Strongly prioritize {value_names}
Moderately prioritize {value_names}
Near average {value_names}
Lower priority {value_names}
Much lower priority {value_names}
Value Definitions: {value_definitions}
```

The full profile puts all 19 values into 5 bands. Its values are in random order within each band.

**How the targets are chosen.** For each value, the score is the user's centered value score times the value's relevance to the scenario (0, 0.5, or 1). The top 2 become the targets. Up to 2 relevant values with negative user scores become the lower-priority values.

**Contrast-clause ablation.** This is the paper's Table 4, on 10,032 samples per condition:

| Condition | Spearman alignment | JS divergence |
| --- | --- | --- |
| Top-k prompt | 0.363 | 0.146 |
| Top-k prompt without the lower-priority values | 0.295 | 0.155 |

The authors conclude that "explicitly identifying values to deprioritize helps align the model to the user's profile."

**Pattern.**
- A few priorities, chosen for this scenario.
- An explicit instruction to put them above named lower priorities.
- A definition for every value, both the targets and the lower priorities.
- Task rules that force a clear decision and ban invented facts.

## 3. Rubric prompts: criteria, levels, steps, reasoning first

**Prometheus** (*summary* of Appendix H; the rubric description is word for word from Section 3). "The rubric consists of (1) a description of the criteria and (2) a description of each scoring decision (1 to 5)." The format is `[[{criteria description}]]`, then `Score 1: {score1 description}` through `Score 5: {score5 description}`. The prompt asks the judge to "Write a detailed feedback that assesses the quality of the response strictly based on the given score rubric", then to write the score. The model is trained "to sequentially generate the feedback and then the score."

**G-Eval** (word for word from Appendix A):

```
You will be given one summary written for a news article.
Your task is to rate the summary on one metric.
Please make sure you read and understand these instructions carefully. ...
Evaluation Criteria:
Coherence (1-5) - the collective quality of all sentences. ...
Evaluation Steps:
...
```

Some G-Eval criteria define every level: "A score of 1 (dull) means that the response is generic and dull."

**Pattern.**
- Each criterion is defined.
- Each level of a criterion is described.
- The procedure is given as explicit steps.
- In Prometheus, the reasoning comes before the score.

## 4. Group and debate prompts

**Persona Inconstancy in Multi-Agent LLM Collaboration**, Appendix B.1, the independent first answer:

```
This is an onboarding stage. At this stage, responses remain anonymous and are not
shared with other participants. Answer the following multiple-choice question
independently:
```

The paper reports that instructions to "stand firm in their beliefs and maintain their personas" made impersonation much rarer (0.018%). That instruction's exact wording is not printed.

## How Council Mode's voter prompt compares

Our identity block and sheet, from `voterIdentity` and the skill template:

```
You are a voter on a decision panel. Your persona: Release engineer.
Your criteria sheet:
Cares about (in order): reproducible builds for 3 OSes from one CI, code signing on macOS and Windows, small artifacts
Accepts: longer CI builds
Rejects: per-OS build machines kept by hand

Rank every option by your criteria, using only the dossier below. The debate authors are hidden.
```

| Element | Value-profile and rubric papers | Council Mode today | Status |
| --- | --- | --- | --- |
| A short list of priorities for this decision | 2 query-relevant values | 3 ranked items, written for this decision in step 1 | Matches |
| What to give up | Named lower-priority values; removing them cut alignment from 0.363 to 0.295 | The Accepts line | Matches; outside support for E6 |
| What is ruled out | The rubric's lowest level | The Rejects line | Roughly matches |
| What each item means | A definition for every value; a description for every rubric level | Item names only | Missing |
| An explicit priority instruction | "Prioritize the strongly valued items above over these lower-priority values" | "Rank every option by your criteria" | Weaker |
| Reasoning before the decision | Feedback, then score | The ballot schema lists `ranking` before `reasons` | Reversed |
| Rules for a clear decision | "You must take a clear side ... Do not invent facts" | "using only the dossier below"; a full ranking is required | Partly matches |
| Independent first answer | Anonymous onboarding before any debate | Voters never see each other's ballots | Matches |
| Identity framing | Absent from value prompts; central in persona prompts | "Your persona: {name}" | Neutral; E3 found no effect |

**Gaps to test.**
1. A definition for each "Cares about" item.
2. An explicit priority instruction.
3. Reasons written before the ranking.

The sheet v2 test measures each one.

## Limits

- **One ablation.** The 0.363-against-0.295 result comes from a single study, on Llama-3.1-8B, with advice scenarios. Council Mode voters rank options instead.
- **Judges, not voters.** The rubric papers study evaluators. Whether reasoning before the score helps a voter that ranks options is untested.
- **Unverified summaries.** The Prometheus template and the Wang and Hu templates are summaries, not checked word for word.

## Sources

- Poole, Jahanbakhsh. [Personalized Alignment of Language Models with Human Value Profiles](https://arxiv.org/abs/2611.09919). Appendix A.7.
- Zhong, Li, Sun, Fan. [Alignment by Stereotyping](https://arxiv.org/abs/2609.05993). Appendix D.
- Xiao et al. [The Chameleon's Limit](https://arxiv.org/abs/2604.24698). Appendix A.1.
- Zheng et al. [When "A Helpful Assistant" Is Not Really Helpful](https://arxiv.org/abs/2311.10054). Table 1.
- Wang, Morgenstern, Dickerson. [LLMs that replace human participants can harmfully misportray and flatten identity groups](https://arxiv.org/abs/2402.01908).
- Hu, Collier. [Quantifying the Persona Effect in LLM Simulations](https://arxiv.org/abs/2402.10811). Appendix B.
- Kim et al. [Prometheus](https://arxiv.org/abs/2310.08491). Section 3 and Appendix H.
- Liu et al. [G-Eval](https://arxiv.org/abs/2303.16634). Appendix A.
- [Persona Inconstancy in Multi-Agent LLM Collaboration](https://arxiv.org/abs/2405.03862). Appendix B.
