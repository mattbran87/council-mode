#!/usr/bin/env node
// Layer 1: node evals/invariants.mjs [fixture dir ...]. Exit 1 when any check fails or errors.
import { basename } from 'node:path'
import { listFixtures, loadFixture } from './lib/fixture.mjs'
import { runChecks } from './lib/checks.mjs'

const dirs = process.argv.slice(2).length ? process.argv.slice(2) : listFixtures()
let bad = false
for (const dir of dirs) {
  console.log(`\n${basename(dir)}`)
  let fx
  try {
    fx = loadFixture(dir)
  } catch (e) {
    console.log(`  ERROR  cannot load fixture: ${e.message}`)
    bad = true
    continue
  }
  for (const r of runChecks(fx)) {
    console.log(`  ${r.status.padEnd(5)}  ${r.name}: ${r.detail}`)
    if (r.status === 'FAIL' || r.status === 'ERROR') bad = true
  }
}
process.exit(bad ? 1 : 0)
