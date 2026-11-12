import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const PER_CALL_CAP_USD = 0.5
export const CALL_TIMEOUT_MS = 300000

// On Windows the npm shim is claude.CMD, which mangles arguments; run claude.exe directly when it is there.
export function claudeArgv() {
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8' })
  const first = (which.stdout || '').split(/\r?\n/).find(Boolean)
  if (!first) return null
  const exe = join(dirname(first), 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
  return [existsSync(exe) ? exe : first]
}

export function buildArgs({ model, schema, budgetUsd }) {
  return [
    '-p', '--output-format', 'json',
    '--model', model,
    '--max-budget-usd', budgetUsd.toFixed(4),
    '--json-schema', JSON.stringify(schema),
    // --safe-mode: no plugins, hooks, MCP servers, CLAUDE.md, or output styles, so the user's setup cannot change a call.
    '--safe-mode',
    // --tools: the only tools the model can see.
    '--tools', 'WebSearch,WebFetch',
    // --allowedTools: in -p mode --tools alone does not grant permission, so the calls would be denied.
    '--allowedTools', 'WebSearch,WebFetch',
  ]
}

export function parseOutput(stdout) {
  let j
  try { j = JSON.parse(stdout) } catch { return { ok: false, error: `CLI output is not JSON: ${String(stdout).slice(0, 200)}` } }
  const cost = typeof j.total_cost_usd === 'number' ? j.total_cost_usd : null
  const durationMs = typeof j.duration_ms === 'number' ? j.duration_ms : null
  if (j.is_error) return { ok: false, error: `${j.subtype || 'error'}: ${j.result || 'CLI reported an error'}`, subtype: j.subtype, cost, durationMs }
  let output = j.structured_output ?? null
  if (output == null && typeof j.result === 'string') {
    try { output = JSON.parse(j.result) } catch { output = null }
  }
  return { ok: true, output, cost, durationMs }
}

export function runClaude({ prompt, model, schema, budgetUsd, runner = spawnSync, argv0 = claudeArgv() }) {
  if (!argv0) return { ok: false, error: 'claude is not on the PATH' }
  const started = Date.now()
  const res = runner(argv0[0], [...argv0.slice(1), ...buildArgs({ model, schema, budgetUsd })], {
    input: prompt, encoding: 'utf8', timeout: CALL_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024,
  })
  if (res.error) return { ok: false, error: res.error.message, durationMs: Date.now() - started }
  const parsed = parseOutput(res.stdout || '')
  if (!parsed.ok && res.status !== 0 && res.stderr) parsed.error += ` (stderr: ${res.stderr.slice(0, 200)})`
  return { ...parsed, durationMs: parsed.durationMs ?? Date.now() - started }
}
