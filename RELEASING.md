# Releasing the @synfin packages

How the public `@synfin` packages are verified and published. The first npm
release is a pre-alpha under the `next` dist-tag. Nothing here publishes
automatically: publishing is a human step run after a release-readiness PR is
merged.

## Publish set

Public (published to npm), in topological dependency order:

1. `@synfin/spec`
2. `@synfin/adapters`
3. `@synfin/router-ref`
4. `@synfin/conformance`
5. `@synfin/cli`

Private (never published, marked `"private": true`): the root workspace,
`apps/web`, and `tools/price-monitor`.

The packages are ESM only (`type: module`, `exports` expose `types` and
`import`, no `require`). They target Node 20 or newer.

## Versioning

The pre-alpha is `0.1.0-alpha.1` for every package in the set, published under the
`next` dist-tag. `latest` is intentionally not set for a pre-alpha. Internal
dependencies stay on the `workspace:*` protocol in the repo; pnpm rewrites them to
the exact version at pack and publish time.

## Verify before publishing

Two checks, both publish nothing:

- `pnpm release:verify` (also a CI job): builds, then runs `publint` and
  `attw` on each package and asserts every `pnpm pack` tarball ships only build
  output, `README.md`, and `LICENSE` (plus `schemas/` for `@synfin/spec`).
- `pnpm release:verify:verdaccio` (local): publishes the whole set to a
  throwaway Verdaccio registry, installs it in a clean directory outside the
  workspace, runs a no-network smoke (route over mock quotes returns a
  `RoutePlan`), and typechecks a downstream consumer under both `bundler` and
  `node16` module resolution. Needs a writable `/tmp` and network for the npmjs
  uplink. It cleans up after itself.

## How releases work

There are two phases. You bootstrap each package once, by hand, because npm
trusted publishing cannot be configured for a package that does not exist yet.
After that, every release is token free: bump versions, push a matching tag, and
the `release.yml` workflow publishes with OIDC and provenance. The workflow holds
no npm token and no secret of any kind.

The single source of truth for a release is the package version. All five
publish-set packages carry the same version, and the pushed tag must equal it.
The workflow fails loudly on any mismatch.

## Part A: one-time bootstrap (first publish of each package)

Do this once, locally, to create the packages on npm. This first version has no
provenance; provenance begins with the first version the workflow publishes.

1. Confirm the static gate is green:

   ```sh
   pnpm release:verify
   ```

2. Log in to npm interactively. Use your account with 2FA. Do not create or use a
   long-lived automation token.

   ```sh
   npm login
   ```

3. Publish the five packages once, in dependency order:

   ```sh
   pnpm --filter @synfin/spec        publish --tag next --access public
   pnpm --filter @synfin/adapters    publish --tag next --access public
   pnpm --filter @synfin/router-ref  publish --tag next --access public
   pnpm --filter @synfin/conformance publish --tag next --access public
   pnpm --filter @synfin/cli         publish --tag next --access public
   ```

   We use `pnpm publish` here, not `npm publish`, on purpose: the internal deps
   use pnpm's `workspace:*` protocol, which only pnpm rewrites to a concrete
   version at publish time, and `pnpm publish` runs each package's
   `prepublishOnly` (build plus typecheck) first. The workflow reaches the same
   result for pure npm by resolving `workspace:*` to the release version before it
   publishes (see `.github/workflows/release.yml`). Append `--dry-run` to preview
   without uploading.

## Part B: configure trusted publishing (once per package, after bootstrap)

On npmjs.com, for each package, open Settings, then Trusted Publisher, then
GitHub Actions, and enter these exact values (matching is case sensitive):

- Organization or user: `cayvox`
- Repository: `SynFin`
- Workflow filename: `release.yml`
- Environment name: `release`

Do this for all five so none is missed:

- `@synfin/spec`
- `@synfin/adapters`
- `@synfin/router-ref`
- `@synfin/conformance`
- `@synfin/cli`

## Part C: steady-state release (every future release, token free)

1. Bump the version of all five publish-set packages to the new prerelease (for
   example `0.1.0-alpha.2`). Keep them identical.
2. Commit, open a PR, and merge to `main`.
3. Create and push a tag that matches the version exactly, prefixed with `v`:

   ```sh
   git tag v0.1.0-alpha.2
   git push origin v0.1.0-alpha.2
   ```

4. The `release.yml` workflow runs: it asserts every package version equals the
   tag, runs `pnpm release:verify`, resolves `workspace:*` to the version, then
   publishes each package in dependency order with `npm publish --provenance`
   under OIDC. It finishes by reading each package back from npm and asserting the
   published version matches the tag.

You can also trigger the workflow manually from the Actions tab
(`workflow_dispatch`); with no tag it publishes the version currently in the
packages, after the same consistency checks.

## GitHub setup: the `release` environment

Create a repository Environment named `release` (Settings, then Environments).
The publish job declares `environment: release`, so anything you require there
gates the publish. Add required reviewers if you want every publish to pause for
human approval before it runs.

## Pre-release checklist

- [ ] `pnpm release:verify` is green (CI and local).
- [ ] `pnpm release:verify:verdaccio` is green locally.
- [ ] All five packages carry the same new version.
- [ ] Trusted publishing is configured for all five packages (Part B).
- [ ] The `release` environment exists (with reviewers if you want approval).
- [ ] The pushed tag equals the package version, prefixed with `v`.
