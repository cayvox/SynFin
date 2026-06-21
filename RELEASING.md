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

## Publish (human step, after the PR merges)

Authenticate to npm (an automation token with publish rights to the `@synfin`
scope), then publish in dependency order with the `next` tag. Each package runs
its `prepublishOnly` (build plus typecheck) first, so a stale or missing `dist`
cannot be published.

```sh
pnpm --filter @synfin/spec        publish --tag next
pnpm --filter @synfin/adapters    publish --tag next
pnpm --filter @synfin/router-ref  publish --tag next
pnpm --filter @synfin/conformance publish --tag next
pnpm --filter @synfin/cli         publish --tag next
```

To preview without uploading, append `--dry-run`. Consumers install the
pre-alpha with the `next` tag, for example `npm install @synfin/router-ref@next`.

## Pre-publish checklist

- [ ] `pnpm release:verify` is green (CI and local).
- [ ] `pnpm release:verify:verdaccio` is green locally.
- [ ] Versions and the `next` tag are correct in every publish-set package.
- [ ] You are authenticated to npm with publish rights to `@synfin`.
- [ ] Publish in the order above. Verify each on npm before the next.
