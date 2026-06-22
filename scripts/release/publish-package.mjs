// Single source of truth for publishing one @synfin package with npm.
//
// npm does not understand pnpm's `workspace:*` protocol, so before publishing we
// rewrite every internal @synfin dependency to a concrete range, mirroring pnpm's
// native workspace-protocol semantics EXACTLY:
//
//   workspace:*           -> <dep version>      (exact)
//   workspace:~           -> ~<dep version>
//   workspace:^           -> ^<dep version>
//   workspace:<explicit>  -> <explicit>         (the part after "workspace:")
//
// The <dep version> is read from that dependency's own manifest in the workspace,
// exactly as pnpm resolves the linked package. We rewrite dependencies,
// devDependencies, peerDependencies, AND optionalDependencies, then assert the
// to-be-published manifest contains no "workspace:" substring and that every
// @synfin range is valid semver. Then we run `npm publish` with the passed flags.
//
// Both the production workflow (.github/workflows/release.yml) and the local
// Verdaccio proof (scripts/release-verify-verdaccio.sh) call THIS script, so the
// artifact that is proven installable is literally the artifact that ships.
//
// This script contains no authentication logic. Auth is the caller's concern:
// OIDC trusted publishing in CI, a throwaway .npmrc for Verdaccio.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// A range we accept after rewriting: an optional comparator, then a semver core
// with optional prerelease and build metadata (covers 0.1.0-alpha.1, ^1.2.3, ...).
const SEMVER_RANGE =
  /^(\^|~|>=|<=|>|<|=)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

// pnpm rewrites the workspace protocol in every dependency field, devDependencies
// included (verified against `pnpm pack`), and npm keeps devDependencies in the
// published manifest. We rewrite all four so the npm artifact is byte-identical to
// pnpm's, and the no-"workspace:" assertion below guarantees none is missed.
const DEP_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

function die(msg) {
  console.error(`publish-package: ${msg}`);
  process.exit(1);
}

// Build a map of every workspace package name -> version, across the same globs
// as pnpm-workspace.yaml (packages/*, tools/*, apps/*).
function workspaceVersions() {
  const map = new Map();
  for (const glob of ['packages', 'tools', 'apps']) {
    const base = join(repoRoot, glob);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base)) {
      const pj = join(base, entry, 'package.json');
      if (!existsSync(pj)) continue;
      const j = JSON.parse(readFileSync(pj, 'utf8'));
      if (j.name && j.version) map.set(j.name, j.version);
    }
  }
  return map;
}

// Mirror pnpm's workspace-protocol replacement for a single specifier.
function resolveWorkspaceSpec(name, spec, versions) {
  const rest = spec.slice('workspace:'.length);
  const v = versions.get(name);
  if (rest === '*' || rest === '~' || rest === '^') {
    if (!v) die(`cannot resolve ${name}: not found in the workspace`);
    return rest === '*' ? v : `${rest}${v}`;
  }
  // workspace:<explicit range> -> the explicit range, verbatim.
  return rest;
}

function parseArgs(argv) {
  const opts = { provenance: false, dryRun: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--provenance') opts.provenance = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--registry') opts.registry = argv[++i];
    else if (a === '--tag') opts.tag = argv[++i];
    else if (a === '--also-tag') opts.alsoTag = argv[++i];
    else if (a === '--access') opts.access = argv[++i];
    else if (a.startsWith('--registry=')) opts.registry = a.split('=')[1];
    else if (a.startsWith('--tag=')) opts.tag = a.split('=')[1];
    else if (a.startsWith('--also-tag=')) opts.alsoTag = a.split('=')[1];
    else if (a.startsWith('--access=')) opts.access = a.split('=')[1];
    else rest.push(a);
  }
  if (rest.length !== 1)
    die(
      'usage: publish-package.mjs <packageDir> [--registry url] [--tag t] [--also-tag t2] [--access a] [--provenance] [--dry-run]',
    );
  opts.dir = resolve(repoRoot, rest[0]);
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const manifestPath = join(opts.dir, 'package.json');
  if (!existsSync(manifestPath)) die(`no package.json at ${opts.dir}`);

  const versions = workspaceVersions();
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  // 1. Rewrite every internal @synfin dep across all three fields.
  let rewrites = 0;
  for (const field of DEP_FIELDS) {
    const deps = manifest[field];
    if (!deps) continue;
    for (const [name, spec] of Object.entries(deps)) {
      if (!name.startsWith('@synfin/')) continue;
      if (typeof spec !== 'string' || !spec.startsWith('workspace:')) continue;
      deps[name] = resolveWorkspaceSpec(name, spec, versions);
      rewrites++;
    }
  }

  const serialized = JSON.stringify(manifest, null, 2) + '\n';

  // 2a. Hard assert: no workspace: protocol leaked anywhere in the manifest.
  if (serialized.includes('workspace:')) {
    die(
      `${manifest.name}: "workspace:" still present after rewrite (refusing to publish)`,
    );
  }
  // 2b. Every @synfin dependency range must be valid semver.
  for (const field of DEP_FIELDS) {
    const deps = manifest[field];
    if (!deps) continue;
    for (const [name, spec] of Object.entries(deps)) {
      if (!name.startsWith('@synfin/')) continue;
      if (!SEMVER_RANGE.test(spec)) {
        die(
          `${manifest.name}: ${field}.${name} = "${spec}" is not a valid semver range`,
        );
      }
    }
  }

  writeFileSync(manifestPath, serialized);
  console.log(
    `publish-package: ${manifest.name}@${manifest.version} rewrote ${rewrites} workspace dep(s)` +
      (rewrites
        ? ': ' +
          DEP_FIELDS.flatMap((f) =>
            Object.entries(manifest[f] || {})
              .filter(([n]) => n.startsWith('@synfin/'))
              .map(([n, s]) => `${n}@${s}`),
          ).join(', ')
        : ''),
  );

  // 3. npm publish with the passed flags (pure npm; no auth logic here).
  const args = ['publish'];
  if (opts.tag) args.push('--tag', opts.tag);
  if (opts.access) args.push('--access', opts.access);
  if (opts.registry) args.push('--registry', opts.registry);
  if (opts.provenance) args.push('--provenance');
  if (opts.dryRun) args.push('--dry-run');

  console.log(`publish-package: npm ${args.join(' ')}  (cwd ${opts.dir})`);
  const res = spawnSync('npm', args, { cwd: opts.dir, stdio: 'inherit' });
  if (res.status !== 0)
    die(`npm publish failed for ${manifest.name} (exit ${res.status})`);

  // 4. Optionally point a SECOND dist-tag at the just-published version. This is a
  // tag move, not a second publish: the version is published exactly once (with
  // provenance), so npm does not reject a duplicate and no extra provenance is
  // produced. It reuses the same registry session, so it stays pure OIDC (no
  // token). Used to land a release on both `latest` (which populates the rendered
  // npm README from the publish) and `next` (the install channel).
  if (opts.alsoTag && !opts.dryRun) {
    const tagArgs = [
      'dist-tag',
      'add',
      `${manifest.name}@${manifest.version}`,
      opts.alsoTag,
    ];
    if (opts.registry) tagArgs.push('--registry', opts.registry);
    console.log(`publish-package: npm ${tagArgs.join(' ')}`);
    const tagRes = spawnSync('npm', tagArgs, {
      cwd: opts.dir,
      stdio: 'inherit',
    });
    if (tagRes.status !== 0)
      die(
        `npm dist-tag add failed for ${manifest.name} (exit ${tagRes.status})`,
      );
  }
}

main();
