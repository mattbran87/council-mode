import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runWorkflow } from './harness.mjs'

const PERSONAS = Array.from({ length: 7 }, (_, i) => ({
  name: `Persona ${i + 1}`, criteria: 'Cares about: speed', model: i % 2 ? 'sonnet' : 'haiku',
}))
const ARGS = { problem: 'Pick a cache.', personas: PERSONAS, budget: '5 tool calls', refereeModel: 'opus', seed: 11 }
const PREFERENCE = ['alpha', 'beta', 'gamma', 'baseline']

function fakeCouncil(overrides = {}) {
  return (label, prompt) => {
    const [role, key] = label.split(':')
    if (overrides[role]) {
      const out = overrides[role](key, prompt)
      if (out !== undefined) return out
    }
    if (role === 'generate') return { options: [{ description: 'alpha approach' }, { description: 'beta approach' }] }
    if (role === 'merge') {
      return {
        options: [{ description: 'alpha approach' }, { description: 'beta approach' }, { description: 'gamma approach' }],
        baseline: 'baseline: change nothing',
      }
    }
    if (role === 'advocate') {
      return {
        claims: [
          { evidence: 'tested', text: 'meets the target', source: 'bench.txt', confidence: 80 },
          { evidence: 'reasoned', text: 'easy to change', confidence: 60 },
        ],
        weaknesses: ['cost', 'risk'],
        failedTests: [],
      }
    }
    if (role === 'challenge') {
      const rivals = [...new Set([...prompt.matchAll(/^- ([A-Z])-C2\b/gm)].map(m => m[1]))].filter(l => l !== key)
      return {
        challenges: [
          ...rivals.map(l => ({ targetClaim: `${l}-C2`, text: 'clearly not easy', evidence: 'diff size' })),
          { targetClaim: `${rivals[0]}-C1`, text: 'no proof', evidence: '' },
        ],
      }
    }
    if (role === 'referee') {
      return { challenges: [...prompt.matchAll(/^(CH\d+) /gm)].map(m => ({ id: m[1], text: 'not easy' })) }
    }
    if (role === 'reply') {
      const ids = [...prompt.matchAll(/^(CH\d+) against/gm)].map(m => m[1])
      return {
        replies: ids.map((id, i) => i === 0
          ? { challengeId: id, kind: 'concede', evidence: 'the diff is large', newConfidence: 30, dropReason: 'the diff is large', reason: 'fair' }
          : { challengeId: id, kind: 'refute', evidence: 'refactor log', newConfidence: 60, dropReason: '', reason: 'no' }),
      }
    }
    if (role === 'ruling') return { claimHolds: true, checked: 'read the log', note: 'holds' }
    if (role === 'vote') {
      const opts = [...prompt.matchAll(/^### Option ([A-Z])\n(.+)$/gm)].map(m => ({ label: m[1], desc: m[2] }))
      const rank = opts
        .sort((a, b) => PREFERENCE.findIndex(p => a.desc.startsWith(p)) - PREFERENCE.findIndex(p => b.desc.startsWith(p)))
        .map(o => o.label)
      return {
        ranking: rank,
        reasons: rank.slice(0, -1).map((l, i) => ({ higher: l, lower: rank[i + 1], reason: 'better', cites: [`${l}-C1`] })),
        flipCondition: 'if the bench is wrong',
        unacceptable: [],
        hybrid: '',
      }
    }
    throw new Error(`no fake for ${label}`)
  }
}

test('a full run elects the option every voter prefers', async () => {
  const { result } = await runWorkflow({ args: ARGS, respond: fakeCouncil() })
  const alpha = result.options.find(o => o.description === 'alpha approach').label
  assert.equal(result.result.method, 'condorcet')
  assert.equal(result.result.winner, alpha)
  assert.equal(result.ballots.length, 7)
  assert.deepEqual(result.discarded, [])
  assert.equal(result.options.filter(o => o.baseline).length, 1)
})

test('a full run records rejected challenges, concessions, and rulings', async () => {
  const { result } = await runWorkflow({ args: ARGS, respond: fakeCouncil() })
  assert.ok(result.rejectedChallenges.some(r => r.why === 'no evidence'))
  assert.equal(result.dossier.concessions.length, 4)
  assert.ok(result.dossier.rulings.length > 0)
  assert.ok(result.dossier.rulings.every(r => r.claimHolds))
  assert.deepEqual(result.dossier.drops, [])
})

test('the referee and voters get their own models; advocates do not get the referee model', async () => {
  const { calls } = await runWorkflow({ args: ARGS, respond: fakeCouncil() })
  for (const c of calls.filter(c => /^(referee|ruling)/.test(c.opts.label))) assert.equal(c.opts.model, 'opus')
  for (const c of calls.filter(c => /^(advocate|challenge|reply)/.test(c.opts.label))) assert.notEqual(c.opts.model, 'opus')
  const voteModels = calls.filter(c => c.opts.label.startsWith('vote')).map(c => c.opts.model)
  assert.deepEqual(voteModels, PERSONAS.map(p => p.model))
})

test('each voter sees its own option order', async () => {
  const { calls } = await runWorkflow({ args: ARGS, respond: fakeCouncil() })
  const orders = calls.filter(c => c.opts.label.startsWith('vote'))
    .map(c => [...c.prompt.matchAll(/^### Option ([A-Z])$/gm)].map(m => m[1]).join(''))
  assert.ok(new Set(orders).size > 1)
})

test('the same seed gives the same labels', async () => {
  const a = await runWorkflow({ args: ARGS, respond: fakeCouncil() })
  const b = await runWorkflow({ args: ARGS, respond: fakeCouncil() })
  assert.deepEqual(a.result.options, b.result.options)
})

test('fewer than 3 merged options stops the run before research', async () => {
  const respond = fakeCouncil({ merge: () => ({ options: [{ description: 'alpha approach' }], baseline: 'nothing' }) })
  const { result, calls } = await runWorkflow({ args: ARGS, respond })
  assert.match(result.stopped, /fewer than 3/)
  assert.ok(!calls.some(c => c.opts.label.startsWith('advocate')))
})

test('a failed merge stops the run before research', async () => {
  const respond = fakeCouncil({ merge: () => null })
  const { result, calls } = await runWorkflow({ args: ARGS, respond })
  assert.equal(result.stopped, 'the merge agent failed; resume the run to retry it')
  assert.ok(!calls.some(c => c.opts.label.startsWith('advocate')))
})

test('every generator failing stops the run before the merge', async () => {
  const respond = fakeCouncil({ generate: () => null })
  const { result, calls } = await runWorkflow({ args: ARGS, respond })
  assert.equal(result.stopped, 'every option generator failed; resume the run to retry it')
  assert.ok(!calls.some(c => c.opts.label === 'merge'))
})

test('a failed advocate stops the run', async () => {
  const respond = fakeCouncil({ advocate: () => null })
  const { result } = await runWorkflow({ args: ARGS, respond })
  assert.match(result.stopped, /advocate for Option [A-Z] failed/)
})

test('a ballot whose reasons cite nothing is discarded', async () => {
  const base = fakeCouncil()
  const respond = fakeCouncil({
    vote: (key, prompt) => {
      if (key !== 'Persona 1') return undefined
      const b = base('vote:x', prompt)
      return { ...b, reasons: b.reasons.map(r => ({ ...r, cites: [] })) }
    },
  })
  const { result } = await runWorkflow({ args: ARGS, respond })
  assert.equal(result.ballots.length, 6)
  assert.equal(result.discarded[0].persona, 'Persona 1')
})

test('a run where every ballot is discarded stops instead of reporting a tie', async () => {
  const base = fakeCouncil()
  const respond = fakeCouncil({
    vote: (key, prompt) => {
      const b = base('vote:x', prompt)
      return { ...b, reasons: b.reasons.map(r => ({ ...r, cites: [] })) }
    },
  })
  const { result } = await runWorkflow({ args: ARGS, respond })
  assert.match(result.stopped, /every ballot was discarded/)
  assert.equal(result.discarded.length, 7)
})

test('the tally records how many voters counted', async () => {
  const { result } = await runWorkflow({ args: ARGS, respond: fakeCouncil() })
  assert.equal(result.result.voters, 7)
})

test('fixed options skip generation', async () => {
  const args = { ...ARGS, options: [{ description: 'alpha approach' }, { description: 'beta approach' }, { description: 'gamma approach' }], baseline: 'baseline: change nothing' }
  const { result, calls } = await runWorkflow({ args, respond: fakeCouncil() })
  assert.ok(!calls.some(c => /^(generate|merge)/.test(c.opts.label)))
  assert.equal(result.options.length, 4)
})

test('isolateAdvocates puts research, challenge, reply, and ruling agents in worktrees', async () => {
  const { calls } = await runWorkflow({ args: { ...ARGS, isolateAdvocates: true }, respond: fakeCouncil() })
  for (const role of ['advocate', 'challenge', 'reply', 'ruling']) {
    const mine = calls.filter(c => c.opts.label.startsWith(`${role}:`))
    assert.ok(mine.length > 0, role)
    for (const c of mine) assert.equal(c.opts.isolation, 'worktree', c.opts.label)
  }
  for (const c of calls.filter(c => /^(generate|merge|referee|vote)/.test(c.opts.label))) assert.equal(c.opts.isolation, undefined, c.opts.label)
})

test('without isolateAdvocates no agent gets a worktree', async () => {
  const { calls } = await runWorkflow({ args: ARGS, respond: fakeCouncil() })
  for (const c of calls) assert.equal(c.opts.isolation, undefined, c.opts.label)
})

test('revised confidence reaches the voters', async () => {
  const { result, calls } = await runWorkflow({ args: ARGS, respond: fakeCouncil() })
  // The fake concedes the first challenge against each option with confidence 30 and a drop reason.
  const conceded = result.dossier.concessions.map(x => x.challenge.targetClaim)
  const claims = result.dossier.options.flatMap(o => o.claims)
  for (const id of conceded) assert.equal(claims.find(c => c.id === id).revisedConfidence, 30)
  const vote = calls.find(c => c.opts.label.startsWith('vote')).prompt
  assert.match(vote, new RegExp(`- ${conceded[0]} .*confidence \\d+ → 30;`))
})

test('more than 5 fixed options keeps the first 5 and warns', async () => {
  const many = Array.from({ length: 17 }, (_, i) => `option ${i}`)
  const { result } = await runWorkflow({ args: { ...ARGS, options: many }, respond: fakeCouncil() })
  assert.equal(result.stopped, undefined)
  assert.deepEqual(result.options.filter(o => !o.baseline).map(o => o.description), many.slice(0, 5))
  assert.ok(result.warnings.includes('got 17 fixed options; kept the first 5'))
})

test('merged options with an empty description are dropped before the 3-option check', async () => {
  const respond = fakeCouncil({
    merge: () => ({ options: [{ description: 'alpha approach' }, { description: '  ' }, { description: 'beta approach' }, {}], baseline: 'nothing' }),
  })
  const { result } = await runWorkflow({ args: ARGS, respond })
  assert.match(result.stopped, /fewer than 3/)
  assert.equal(result.options.filter(o => !o.baseline).length, 2)
})

test('a merge without a baseline stops the run', async () => {
  const respond = fakeCouncil({
    merge: () => ({ options: [{ description: 'alpha approach' }, { description: 'beta approach' }, { description: 'gamma approach' }], baseline: ' ' }),
  })
  const { result, calls } = await runWorkflow({ args: ARGS, respond })
  assert.equal(result.stopped, 'the merge agent returned no baseline; start the run again with a new seed')
  assert.ok(!calls.some(c => c.opts.label.startsWith('advocate')))
})

test('missing personas throw before any agent runs', async () => {
  await assert.rejects(runWorkflow({ args: { ...ARGS, personas: PERSONAS.slice(0, 6) }, respond: fakeCouncil() }), /exactly 7/)
})

test('a normal run reports an empty warnings list', async () => {
  const { result } = await runWorkflow({ args: ARGS, respond: fakeCouncil() })
  assert.deepEqual(result.warnings, [])
})

test('a failed challenge agent stops the run before the referee', async () => {
  const respond = fakeCouncil({ challenge: () => null })
  const { result, calls } = await runWorkflow({ args: ARGS, respond })
  assert.match(result.stopped, /^the challenge agent for Option [A-Z] failed; resume the run to retry it$/)
  assert.ok(result.options)
  assert.ok(!calls.some(c => c.opts.label.startsWith('referee')))
})

test('a challenge result without a challenges array stops the run', async () => {
  const respond = fakeCouncil({ challenge: () => ({}) })
  const { result } = await runWorkflow({ args: ARGS, respond })
  assert.match(result.stopped, /^the challenge agent for Option [A-Z] failed/)
})

test('a failed referee filter stops the run before replies', async () => {
  const respond = fakeCouncil({ referee: () => null })
  const { result, calls } = await runWorkflow({ args: ARGS, respond })
  assert.equal(result.stopped, 'the referee filter failed; resume the run to retry it')
  assert.ok(!calls.some(c => c.opts.label.startsWith('reply')))
})

test('a referee result without a challenges array stops the run', async () => {
  const respond = fakeCouncil({ referee: () => ({}) })
  const { result } = await runWorkflow({ args: ARGS, respond })
  assert.equal(result.stopped, 'the referee filter failed; resume the run to retry it')
})

test('the referee rewrite matches IDs loosely, and challenges it skipped are listed in warnings', async () => {
  const respond = fakeCouncil({
    referee: (key, prompt) => {
      const ids = [...prompt.matchAll(/^(CH\d+) /gm)].map(m => m[1])
      // A lowercase, padded ID still matches; CH2 and later get no rewrite.
      return { challenges: [{ id: ` ${ids[0].toLowerCase()} `, text: 'not easy' }] }
    },
  })
  const { result, calls } = await runWorkflow({ args: ARGS, respond })
  const prompts = calls.filter(c => c.opts.label.startsWith('reply')).map(c => c.prompt)
  const ch1 = prompts.find(p => /^CH1 against/m.test(p))
  assert.match(ch1, /^CH1 against \S+: not easy \|/m)
  assert.match(result.warnings[0], /^referee did not rewrite CH2, CH3(, CH\d+)*; original wording kept$/)
})

test('the referee rewrite replaces the challenge wording', async () => {
  const { calls } = await runWorkflow({ args: ARGS, respond: fakeCouncil() })
  const replies = calls.filter(c => c.opts.label.startsWith('reply'))
  assert.ok(replies.length > 0)
  for (const c of replies) {
    assert.match(c.prompt, /not easy/)
    assert.doesNotMatch(c.prompt, /clearly/)
  }
})

test('a failed reply agent stops the run before rulings', async () => {
  const respond = fakeCouncil({ reply: () => null })
  const { result, calls } = await runWorkflow({ args: ARGS, respond })
  assert.match(result.stopped, /^the reply agent for Option [A-Z] failed; resume the run to retry it$/)
  assert.ok(!calls.some(c => c.opts.label.startsWith('ruling')))
})

test('a failed ruling stops the run before the vote', async () => {
  const respond = fakeCouncil({ ruling: () => null })
  const { result, calls } = await runWorkflow({ args: ARGS, respond })
  assert.match(result.stopped, /^the ruling for R\d+ failed; resume the run to retry it$/)
  assert.ok(!calls.some(c => c.opts.label.startsWith('vote')))
})

test('ruling prompts are blind to option labels and claim IDs', async () => {
  const { calls } = await runWorkflow({ args: ARGS, respond: fakeCouncil() })
  const rulings = calls.filter(c => c.opts.label.startsWith('ruling'))
  assert.ok(rulings.length > 0)
  for (const c of rulings) {
    assert.doesNotMatch(c.prompt, /Option [A-Z]/)
    assert.doesNotMatch(c.prompt, /\b[A-Z]-C\d+\b/)
  }
})

test('two runs with the same args make identical agent calls', async () => {
  const a = await runWorkflow({ args: ARGS, respond: fakeCouncil() })
  const b = await runWorkflow({ args: ARGS, respond: fakeCouncil() })
  assert.equal(a.calls.length, b.calls.length)
  a.calls.forEach((c, i) => {
    assert.equal(c.prompt, b.calls[i].prompt)
    assert.equal(JSON.stringify(c.opts), JSON.stringify(b.calls[i].opts))
  })
})

test('a different seed gives different labels', async () => {
  const a = await runWorkflow({ args: ARGS, respond: fakeCouncil() })
  const b = await runWorkflow({ args: { ...ARGS, seed: 12 }, respond: fakeCouncil() })
  assert.notDeepEqual(a.result.options.map(o => o.label), b.result.options.map(o => o.label))
})

test('a numeric string seed counts as that number', async () => {
  const a = await runWorkflow({ args: ARGS, respond: fakeCouncil() })
  const b = await runWorkflow({ args: { ...ARGS, seed: '11' }, respond: fakeCouncil() })
  assert.deepEqual(a.result.options, b.result.options)
})

test('a missing refereeModel throws before any agent runs', async () => {
  const { refereeModel, ...args } = ARGS
  const labels = []
  await assert.rejects(runWorkflow({ args, respond: l => { labels.push(l); return null } }), /refereeModel/)
  assert.equal(labels.length, 0)
})

test('a referee model equal to the advocate model throws', async () => {
  await assert.rejects(runWorkflow({ args: { ...ARGS, advocateModel: 'opus' }, respond: fakeCouncil() }), /refereeModel/)
})

test('duplicate persona names throw', async () => {
  const personas = PERSONAS.map((p, i) => (i === 6 ? { ...p, name: 'Persona 1' } : p))
  await assert.rejects(runWorkflow({ args: { ...ARGS, personas }, respond: fakeCouncil() }), /duplicate persona name/)
})

test('fixed options may be plain strings', async () => {
  const args = { ...ARGS, options: ['alpha approach', 'beta approach', 'gamma approach'], baseline: 'baseline: change nothing' }
  const { result } = await runWorkflow({ args, respond: fakeCouncil() })
  const alpha = result.options.find(o => o.description === 'alpha approach').label
  assert.equal(result.result.winner, alpha)
  assert.equal(result.options.find(o => o.baseline).description, 'baseline: change nothing')
})

test('fixed options or a baseline without a description throw before any agent runs', async () => {
  const labels = []
  const respond = l => { labels.push(l); return null }
  const good = ['alpha approach', 'beta approach', 'gamma approach']
  await assert.rejects(runWorkflow({ args: { ...ARGS, options: [...good.slice(0, 2), { text: 'gamma' }] }, respond }), /every fixed option needs a description/)
  await assert.rejects(runWorkflow({ args: { ...ARGS, options: [...good.slice(0, 2), '  '] }, respond }), /every fixed option needs a description/)
  await assert.rejects(runWorkflow({ args: { ...ARGS, options: good, baseline: '' }, respond }), /every fixed option needs a description/)
  assert.equal(labels.length, 0)
})

test('more than 5 merged options keeps the first 5 and warns', async () => {
  const many = Array.from({ length: 7 }, (_, i) => ({ description: `option ${i}` }))
  const respond = fakeCouncil({ merge: () => ({ options: many, baseline: 'nothing' }) })
  const { result, calls } = await runWorkflow({ args: ARGS, respond })
  assert.equal(result.stopped, undefined)
  assert.deepEqual(result.options.filter(o => !o.baseline).map(o => o.description), many.slice(0, 5).map(o => o.description))
  assert.equal(result.options.length, 6)
  assert.equal(calls.filter(c => c.opts.label.startsWith('advocate:')).length, 6)
  assert.ok(result.warnings.includes('merged 7 options; kept the first 5'))
})

test('the merge prompt in a run asks for at most 5 options', async () => {
  const { calls } = await runWorkflow({ args: ARGS, respond: fakeCouncil() })
  assert.match(calls.find(c => c.opts.label === 'merge').prompt, /at most 5 options; keep the most different approaches/)
})

test('one ruling call per disputed claim covers every challenge against it', async () => {
  const { result, calls } = await runWorkflow({ args: ARGS, respond: fakeCouncil() })
  // The fake: every advocate challenges each rival's C2, and each option concedes its first challenge and refutes the rest.
  const rulingCalls = calls.filter(c => c.opts.label.startsWith('ruling:'))
  const rulings = result.dossier.rulings
  assert.equal(rulingCalls.length, 4)
  assert.deepEqual(rulings.map(r => r.id), ['R1', 'R2', 'R3', 'R4'])
  assert.equal(new Set(rulings.map(r => r.claim)).size, 4)
  assert.deepEqual(rulingCalls.map(c => c.opts.label), ['ruling:R1', 'ruling:R2', 'ruling:R3', 'ruling:R4'])
  for (const c of rulingCalls) {
    assert.match(c.prompt, /^Challenge 1: /m)
    assert.match(c.prompt, /^Challenge 2: /m)
    assert.doesNotMatch(c.prompt, /^Challenge 3: /m)
  }
})

test('a false ruling applies to the whole claim group and counts once as adverse', async () => {
  const respond = fakeCouncil({ ruling: () => ({ claimHolds: false, checked: 'diff', note: 'not easy' }) })
  const { result } = await runWorkflow({ args: ARGS, respond })
  for (const f of result.dossier.flips) assert.equal(f.adverse, 1, f.label)
  for (const r of result.dossier.rulings) {
    const claim = result.dossier.options.flatMap(o => o.claims).find(c => c.id === r.claim)
    assert.equal(claim.status, 'struck')
  }
})
