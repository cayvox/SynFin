# @synfin/web

The Synfin website — the open, neutral **best-execution aggregation layer** for
Canton (built on CIP-0056/0112; not a venue, not a competing standard). A
bespoke, fast, static **Astro 5** site that lives in the monorepo as `apps/web`.

This package is **Phase 1**: the locked design identity (tokens, self-hosted
fonts, base) + **Nav · Hero (with the best-execution RouterCard) · LedgerTicker ·
Footer**. Content sections 2–9 and the Phase-3 premium pass are marked with
`TODO` comments and land in later PRs.

Source of truth: [`docs/DESIGN.md`](docs/DESIGN.md), [`docs/CONTENT.md`](docs/CONTENT.md),
[`docs/STACK.md`](docs/STACK.md). Do not contradict them.

## Run (from the repo root)

```bash
pnpm install
pnpm --filter @synfin/web dev      # local dev server
pnpm --filter @synfin/web build    # astro check (typecheck) + static build → dist/
pnpm --filter @synfin/web preview   # preview the production build
pnpm --filter @synfin/web lint      # ESLint (uses the root config + eslint-plugin-astro)
pnpm --filter @synfin/web format:check
```

The root gates also cover this package: `pnpm -r build` / `pnpm -w typecheck`
build and typecheck it, and root `eslint . && prettier --check .` lint/format the
`.astro`/`.ts`/`.css` here.

## Stack

Astro 5 (TypeScript, strict) · vanilla CSS with design tokens (no Tailwind/UI
kit) · GSAP + ScrollTrigger (hero timeline + scroll reveals) · self-hosted fonts
(Newsreader variable + Geist + Geist Mono in `public/fonts/`, never a CDN).

It is a **leaf app**: it does not import from the protocol/Daml/tools packages.

## Deploy

Cloudflare Pages, built from the repo root (STACK.md):
build command `pnpm install --frozen-lockfile && pnpm --filter @synfin/web build`,
output `apps/web/dist`. Domain `synfin.xyz` is pending — the canonical is
configurable via the `SITE_URL` env var.
