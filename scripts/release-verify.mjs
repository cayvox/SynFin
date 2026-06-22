// Release readiness: static publish checks for the public @synfin packages.
// Runs in CI and locally. For each publishable package (every packages/* whose
// package.json is not private) it: builds, runs publint, runs attw on the packed
// tarball, packs it, and asserts the tarball contains ONLY shippable artifacts
// (dist js + d.ts, package.json, README, LICENSE, and schemas for @synfin/spec).
// No registry, no publish. The full publish + clean-room install + smoke flow
// lives in scripts/release-verify-verdaccio.sh (local, documented in RELEASING.md).
//
// The packages are intentionally ESM only (type: module, exports expose types +
// import, no require). attw's only finding is therefore `cjs-resolves-to-esm`,
// which is the correct, expected signal for an ESM-only package (a CommonJS
// consumer uses dynamic import). We suppress exactly that one rule.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = process.cwd();
const ATTW_IGNORE = 'cjs-resolves-to-esm';

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...opts });
}

// Discover the publish set: packages/* that are not private.
const publishSet = readdirSync('packages')
  .map((d) => join('packages', d))
  .filter((p) => {
    try {
      const j = JSON.parse(readFileSync(join(p, 'package.json'), 'utf8'));
      return j.private !== true && typeof j.name === 'string';
    } catch {
      return false;
    }
  })
  .sort();

console.log('release:verify: publish set:', publishSet.join(', '));

// A file in the tarball is allowed iff it matches one of these (after the
// leading "package/" is stripped).
const allow = [
  /^package\.json$/,
  /^README\.md$/,
  /^LICENSE$/,
  /^dist\/.*\.js$/,
  /^dist\/.*\.d\.ts$/,
  /^schemas\/.*\.json$/, // @synfin/spec ships the JSON Schemas
  /^fixtures\/.*\.json$/, // @synfin/cli bundles its demo quote fixtures (JSON only)
];
// Things that must never ship. The allow list above is the positive gate; this
// catches obvious leaks. Note: a `fixtures/` dir is permitted only for JSON data
// (see the allow list), so source or test files under it still fail the gate.
const forbiddenHint =
  /(^|\/)(src\/|.*\.test\.|.*\.spec\.|tests?\/|tsconfig|\.env|vitest|.*\.map)$/i;

let failures = 0;
const summary = [];

// One fresh build for the whole set.
console.log('\n• building all packages …');
run('pnpm', ['-r', 'build'], { stdio: 'inherit' });

for (const dir of publishSet) {
  const name = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name;
  console.log(`\n══════ ${name} (${dir}) ══════`);

  // 1. publint
  try {
    const out = run('pnpm', ['exec', 'publint', dir]);
    if (!/All good!/.test(out)) throw new Error(out);
    console.log('  publint: All good');
  } catch (e) {
    console.error('  publint FAILED:\n' + (e.stdout || e.message));
    failures++;
  }

  // 2. attw (on packed tarball), ESM-only rule suppressed
  try {
    run(
      'pnpm',
      ['exec', 'attw', '--pack', '.', '--ignore-rules', ATTW_IGNORE],
      {
        cwd: join(root, dir),
      },
    );
    console.log('  attw: no problems (ESM-only)');
  } catch (e) {
    console.error('  attw FAILED:\n' + (e.stdout || e.message));
    failures++;
  }

  // 3. pack + assert tarball contents
  const out = mkdtempSync(join(tmpdir(), 'relverify-'));
  try {
    run('pnpm', ['pack', '--pack-destination', out], { cwd: join(root, dir) });
    const tgz = readdirSync(out).find((f) => f.endsWith('.tgz'));
    const list = run('tar', ['-tzf', join(out, tgz)])
      .split('\n')
      .map((l) => l.replace(/^package\//, '').trim())
      .filter(Boolean);
    const bad = list.filter(
      (f) => forbiddenHint.test(f) || !allow.some((re) => re.test(f)),
    );
    if (bad.length) {
      console.error(
        '  tarball FAILED: unexpected files:\n   ' + bad.join('\n   '),
      );
      failures++;
    } else {
      console.log(`  tarball: ${list.length} files, all shippable`);
    }
    summary.push(`${name}: ${list.length} files`);
  } catch (e) {
    console.error('  pack FAILED:\n' + (e.stdout || e.message));
    failures++;
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

console.log('\n──────────────────────────────');
console.log(summary.join('\n'));
if (failures) {
  console.error(`\nrelease:verify FAILED (${failures} problem(s)).`);
  process.exit(1);
}
console.log(
  '\nrelease:verify PASSED: every publish-set package is publish-ready.',
);
