import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const skill = readFileSync(new URL('../plugins/council-mode/skills/council/SKILL.md', import.meta.url), 'utf8')

test('the skill has frontmatter with a name and a description', () => {
  assert.match(skill, /^---\nname: council\n/)
  assert.match(skill, /\ndescription: .+\n/)
})

test('the skill is user-invoked only, because a run starts 20 or more subagents', () => {
  assert.match(skill, /\ndisable-model-invocation: true\n/)
})

test('the skill names the workflow script and every workflow argument', () => {
  assert.ok(skill.includes('council.workflow.js'))
  for (const arg of ['problem', 'personas', 'budget', 'refereeModel', 'advocateModel', 'seed', 'isolateAdvocates', 'thresholds', 'options', 'baseline']) {
    assert.ok(skill.includes(`\`${arg}\``), arg)
  }
})
