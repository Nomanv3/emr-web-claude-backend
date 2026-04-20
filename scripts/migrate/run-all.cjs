'use strict';
// run-all.cjs — Orchestrator for all migration phases
//
// Usage (from backend/ directory):
//   node scripts/migrate/run-all.cjs                    — run every pending phase
//   node scripts/migrate/run-all.cjs --only=phase-01    — run only phase-01
//   node scripts/migrate/run-all.cjs --only=phase-01/03-master-salutation
//   node scripts/migrate/run-all.cjs --from=phase-02    — start from phase-02
//   node scripts/migrate/run-all.cjs --force            — re-run even completed scripts
//   node scripts/migrate/run-all.cjs --phase=1          — numeric phase alias

const path = require('path');
const fs   = require('fs');
const { spawnSync } = require('child_process');
const { readState }  = require('./lib/state.cjs');

const MIGRATE_DIR = __dirname;
const PHASES = ['phase-01', 'phase-02', 'phase-03'];

// ---------- CLI arg parsing ----------
const args = process.argv.slice(2);
function getArg(prefix) {
  const found = args.find(a => a.startsWith(prefix + '='));
  return found ? found.slice(prefix.length + 1) : null;
}
const only   = getArg('--only');
const from   = getArg('--from');
const phaseN = getArg('--phase');
const force  = args.includes('--force');

// ---------- Collect script files to run ----------
function getScriptsForPhase(phaseDir) {
  const full = path.join(MIGRATE_DIR, phaseDir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full)
    .filter(f => f.endsWith('.cjs'))
    .sort()
    .map(f => path.join(full, f));
}

let scripts = [];

if (only) {
  // --only=phase-01 or --only=phase-01/03-master-salutation
  if (only.includes('/')) {
    // specific file
    const [phaseDir, fileBase] = only.split('/');
    const ext = fileBase.endsWith('.cjs') ? fileBase : fileBase + '.cjs';
    const full = path.join(MIGRATE_DIR, phaseDir, ext);
    if (!fs.existsSync(full)) {
      console.error(`Script not found: ${full}`);
      process.exit(1);
    }
    scripts = [full];
  } else {
    scripts = getScriptsForPhase(only);
  }
} else if (phaseN) {
  const phaseDir = `phase-0${phaseN}`;
  scripts = getScriptsForPhase(phaseDir);
} else {
  // Build full list, respecting --from
  let started = !from;
  for (const phase of PHASES) {
    if (!started && phase === from) started = true;
    if (started) scripts.push(...getScriptsForPhase(phase));
  }
}

if (scripts.length === 0) {
  console.log('No scripts matched. Exiting.');
  process.exit(0);
}

// ---------- Run ----------
let failed = 0;
const state = readState();

for (const script of scripts) {
  const rel = path.relative(MIGRATE_DIR, script);

  // Determine the "table name" key from the script filename
  // e.g. phase-01/01-organization.cjs → "organization"
  const basename = path.basename(script, '.cjs');
  const tableKey = basename.replace(/^\d+-/, '').replace(/-/g, '_');

  // Skip if already ok (unless --force)
  if (!force && state[tableKey] && state[tableKey].ok) {
    console.log(`[SKIP]  ${rel}  (already ok, use --force to re-run)`);
    continue;
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[RUN]  ${rel}`);
  console.log(`${'─'.repeat(60)}`);

  const result = spawnSync('node', [script], {
    stdio: 'inherit',
    env:   process.env,
  });

  if (result.status !== 0) {
    console.error(`[FAIL] ${rel} exited with code ${result.status}`);
    failed++;
    // Continue running remaining scripts so we get a full picture
  } else {
    console.log(`[OK]   ${rel}`);
  }
}

console.log(`\n${'═'.repeat(60)}`);
if (failed === 0) {
  console.log(`All ${scripts.length} script(s) completed successfully.`);
} else {
  console.log(`${failed} script(s) FAILED out of ${scripts.length}.`);
}
console.log(`${'═'.repeat(60)}`);

process.exit(failed > 0 ? 1 : 0);
