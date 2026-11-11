import { readFileSync } from 'node:fs'

const SCRIPT = new URL('../plugins/council-mode/skills/council/council.workflow.js', import.meta.url)
const START = '// --- pure helpers start'
const END = '// --- pure helpers end'

function source() {
  return readFileSync(SCRIPT, 'utf8')
}

// Evaluates only the helpers section and returns the named bindings.
export function loadHelpers(...names) {
  const src = source()
  const start = src.indexOf(START)
  const end = src.indexOf(END)
  if (start < 0 || end < start) throw new Error('helpers markers not found')
  const body = `${src.slice(start, end)}\nreturn { ${names.join(', ')} }`
  return new Function(body)()
}

// Runs the whole script with fake Workflow globals. `respond(label, prompt, opts)` plays every agent.
export async function runWorkflow({ args, respond }) {
  const src = source()
  if (!src.startsWith('export const meta')) throw new Error('script must start with export const meta')
  for (const banned of ['Date.now(', 'Math.random(', 'new Date()', 'import ', 'require(']) {
    if (src.includes(banned)) throw new Error(`script uses banned ${banned}`)
  }
  const body = src.replace('export const meta', 'const meta')
  const AsyncFunction = (async () => {}).constructor
  const calls = []
  const logs = []
  const agent = async (prompt, opts = {}) => {
    calls.push({ prompt, opts })
    return respond(opts.label, prompt, opts)
  }
  const parallel = async thunks => Promise.all(thunks.map(t => Promise.resolve().then(t).catch(() => null)))
  const pipeline = async (items, ...stages) =>
    Promise.all(items.map(async (item, i) => {
      let value = item
      for (const stage of stages) {
        try { value = await stage(value, item, i) } catch { return null }
      }
      return value
    }))
  const budget = { total: null, spent: () => 0, remaining: () => Infinity }
  const fn = new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', body)
  const result = await fn(agent, parallel, pipeline, () => {}, m => logs.push(m), args, budget)
  return { result, calls, logs }
}
