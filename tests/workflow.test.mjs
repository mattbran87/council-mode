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
      const rivals = [...new Set([...prompt.matchAll(/\b([A-Z])-C2\b/g)].map(m => m[1]))].filter(l => l !== key)
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

test('isolateAdvocates puts research agents in worktrees', async () => {
  const { calls } = await runWorkflow({ args: { ...ARGS, isolateAdvocates: true }, respond: fakeCouncil() })
  for (const c of calls.filter(c => c.opts.label.startsWith('advocate'))) assert.equal(c.opts.isolation, 'worktree')
})

test('missing personas throw before any agent runs', async () => {
  await assert.rejects(runWorkflow({ args: { ...ARGS, personas: PERSONAS.slice(0, 6) }, respond: fakeCouncil() }), /exactly 7/)
})
