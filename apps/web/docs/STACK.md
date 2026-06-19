# Synfin — Build Stack, Structure & Conventions

How the Synfin website is built and shipped. It is **not a separate repo** — it lives **inside the
existing `cayvox/synfin` monorepo** as a new workspace package (`apps/web`), alongside the protocol
packages (spec, router, adapters), the Daml settlement library, and the tools. One monorepo holds the
whole architecture: core/"backend" (packages + Daml + tools) and the website frontend (`apps/web`).
It is a bespoke, fast, static, premium site that deploys to Cloudflare Pages (matching the
cayvox.com / partylayer.xyz pattern), built from the monorepo.

---

## Stack

- **Astro 5** (TypeScript, `strict`) — content-first, ships ~zero JS by default (speed = premium),
  Vite under the hood, Cloudflare-friendly static output. Interactive bits are isolated islands.
- **GSAP** (+ ScrollTrigger) for the hero timeline and scroll reveals. Loaded only where used.
- **Vanilla CSS with design tokens** (CSS custom properties from DESIGN.md) in a global
  `tokens.css` + `base.css`, plus Astro **scoped component styles**. **No Tailwind / UI kit** —
  this is a bespoke identity; utility frameworks pull it toward "templated".
- **Self-hosted fonts** (no Google CDN): install `geist` and `@fontsource-variable/newsreader`
  from npm; expose via `@font-face` in `fonts.css`, `font-display: swap`, `font-optical-sizing: auto`
  on the display face, and `<link rel="preload">` the hero faces (Newsreader variable normal + italic,
  Geist 400/500/600, Geist Mono 400/500).
- **TypeScript** for all islands/scripts. No `any`.
- Package manager: **pnpm**.

> Why Astro here: the website is a static marketing site, not an app. Astro gives the smallest,
> fastest output and the cleanest path to a bespoke design + Cloudflare Pages, and it slots cleanly
> into the existing pnpm workspace as `apps/web`. (Any future aggregator API / reference trading UI
> can be its own workspace package, e.g. `apps/api` or `apps/app`, in the same monorepo.)

---

## Project structure (inside the existing monorepo)

The website is added as `apps/web` in the existing `cayvox/synfin` pnpm monorepo. **Do not** restructure
or touch the existing packages — only add `apps/web` and wire it into the workspace. Confirm the repo's
actual layout in Step 0 and follow its conventions; the sketch below shows the intended shape:

```
cayvox/synfin/                      # EXISTING monorepo — do not disturb existing dirs
├─ pnpm-workspace.yaml              # ADD "apps/*" (or "apps/web") to the packages list
├─ package.json                     # root scripts (build/lint/format/test) — extend to include the web app
├─ tsconfig.base.json               # reuse the existing base TS config if present
├─ .eslintrc* / prettier config     # reuse/extend the existing root configs (don't fork a conflicting one)
├─ .github/workflows/               # EXISTING CI — extend, don't duplicate (see Monorepo integration)
├─ packages/  (or wherever)         # EXISTING: @synfin/spec, router-ref, adapters, conformance, cli, ...
├─ daml/                            # EXISTING: synfin-settlement
├─ tools/                           # EXISTING: price-monitor
└─ apps/
   └─ web/                          # NEW — the website (this PR)
      ├─ package.json               # name e.g. "@synfin/web", private:true; scripts: dev/build/check/preview
      ├─ astro.config.mjs
      ├─ tsconfig.json              # extends the monorepo base config
      ├─ public/
      │  ├─ favicon.svg             # the seal mark
      │  ├─ og.png                  # social card (added later)
      │  └─ fonts/                  # self-hosted woff2 (committed)
      ├─ src/
      │  ├─ styles/  tokens.css · fonts.css · base.css
      │  ├─ components/  SealMark · Nav · Footer · Button · RouterCard · TickRule · LedgerTicker · Eyebrow · Section (.astro)
      │  ├─ scripts/  hero.ts · reveal.ts
      │  ├─ layouts/  Base.astro
      │  └─ pages/  index.astro
      └─ docs/                      # DESIGN.md, CONTENT.md, STACK.md (+ reference/synfin-hero-v4.html)
```

---

## Fonts setup (exact)

1. From the repo root: `pnpm --filter @synfin/web add geist @fontsource-variable/newsreader`
   (or add inside `apps/web`). Use the workspace; keep a single root lockfile.
2. Copy the needed woff2 into `apps/web/public/fonts/` — at minimum:
   the **Newsreader variable** woff2 (wght + opsz, **normal and italic**) from
   `@fontsource-variable/newsreader`, plus `Geist-Regular/Medium/SemiBold/Bold.woff2` and
   `GeistMono-Regular/Medium.woff2`.
3. `fonts.css` declares `@font-face` for families `"Newsreader"` (variable, normal + italic,
   with `font-optical-sizing: auto` applied where used), `"Geist"` (400/500/600/700), and
   `"Geist Mono"` (400/500), all `font-display: swap`.
4. In `Base.astro`, `<link rel="preload" as="font" type="font/woff2" crossorigin>` the hero faces
   (Newsreader variable normal, Geist 400/500/600, Geist Mono 400/500).
5. `--font-display`, `--font-ui`, `--font-mono` tokens reference these families. Keep `--font-display`
   trivially swappable (it is our #1 upgrade lever — a licensed apex face is a one-line change).

---

## Deployment — Cloudflare Pages (monorepo-aware)

- Build from the **repo root** so the workspace resolves: install at root, build the web filter.
  Cloudflare Pages project settings:
  - Build command: `pnpm install --frozen-lockfile && pnpm --filter @synfin/web build`
  - Build output directory: `apps/web/dist`
  - Root directory: repo root (leave default); framework preset: Astro (or None with the command above).
- Domain: **synfin.xyz** (DNS on Cloudflare; domain pending — keep config/env-driven). Apex + `www`.
- No SSR/runtime needed (static). Add `apps/web/public/_headers` for caching + security headers later.
- The monorepo's other packages (Daml, tools) are not part of the web build; the filtered build keeps
  the Pages build fast and isolated.

---

## Conventions (match Cayvox's existing repos)

- **Branch + PR only. NEVER push to `main`.** Open a PR with a full, professional description.
- **DCO sign-off** on every commit: `git commit -s`.
- **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `style:`, `ci:`).
- A PR template; each PR description states scope, what changed, how to verify, screenshots.
- **No AI attribution anywhere** — no "Claude", "Anthropic", "Generated by", or co-author trailers in
  commits, PR bodies, or code comments. Authorship is the human team.
- Engineering doctrine: **"en doğru mühendislik + 0 varsayım"** — best engineering, zero assumptions.
  Verify every claim; don't break working functionality; if unsure, ask in the PR rather than guess.

---

## Monorepo integration (critical — zero assumptions)

The website must slot into the existing monorepo without breaking anything. In Step 0, inspect and
then integrate:

- **Workspace:** add `apps/*` (or `apps/web`) to `pnpm-workspace.yaml`. Keep the single root lockfile;
  install from root. The web app is `private: true`, name e.g. `@synfin/web`.
- **Root scripts:** the existing root `package.json` likely has `build`, `test`, `lint`, `format`,
  `typecheck`, plus Daml tasks. Wire the web app in so it's covered — e.g. the web app exposes
  `build`/`check`/`lint`/`format` scripts and the root scripts fan out across workspaces (or add a
  `--filter @synfin/web` invocation). **Do not** remove or weaken existing tasks (incl. `daml build` /
  `daml test`).
- **TS / lint / format:** reuse the existing base configs — `apps/web/tsconfig.json` extends the repo
  base; ESLint/Prettier extend the root config (add `prettier-plugin-astro` + the Astro ESLint plugin
  for `.astro` files). Don't fork a conflicting config.
- **CI:** the repo already has CI gates (build · gen-sync · typecheck · test · lint · format · daml
  build · daml test). **Extend** the existing workflow(s) to also build + lint + typecheck the web app
  (e.g. an `apps/web` build step or a job), gated on PRs. **Do not** add a second competing CI that
  duplicates or contradicts the existing one. If a path-filtered job is cleaner, add one that runs the
  web checks when `apps/web/**` changes, while keeping the existing jobs intact.
- **Isolation:** the web app must not import from or depend on the Daml/tools packages; it's a leaf
  app. (It MAY later depend on `@synfin/spec` types if useful — not in this PR.)

## CI checks the web app must pass

- `pnpm install --frozen-lockfile` (root)
- `pnpm --filter @synfin/web build` (Astro `check` + build; fails on type errors)
- `pnpm --filter @synfin/web lint` (ESLint, TS + Astro) and `format:check` (Prettier + prettier-plugin-astro)
- All pre-existing monorepo gates remain green and unchanged.

---

## Quality floor (never announced, always met)

- **Responsive** to 360px; nav collapses; the router card reflows cleanly.
- **Accessibility:** semantic landmarks, a visible skip-link, visible keyboard focus
  (`:focus-visible` rings), aria-labels on the SVG mark and decorative canvases marked `aria-hidden`,
  color-contrast AA for all text.
- **`prefers-reduced-motion`:** all GSAP timelines/scroll-triggers disabled; final states rendered;
  ticker static.
- **Performance:** target Lighthouse ≥ 95 across the board. Preload fonts; no layout shift (tabular
  numerics; reserve card height); lazy nothing that's above the fold; ship minimal JS.
- **SEO/meta:** title, description, canonical, Open Graph/Twitter card, `theme-color`.

---

## Phasing

- **Phase 1 (now):** add `apps/web` to the existing monorepo + wire it into the workspace/CI, then
  tokens/fonts/base + Nav + Footer + **Hero with the RouterCard** (clean base of the locked identity).
  One PR. Existing packages untouched; existing CI gates stay green.
- **Phase 2 (sections):** problem → how-it-works → proof → privacy → dual-architecture → open/closed →
  ecosystem. One or two PRs.
- **Phase 3 (premium pass):** richer backgrounds (paper grain + faint guilloché watermark), premium
  card material (layered shadows, inner highlights), engraved dividers/register marks, interactive
  privacy reveal, OG image, possibly a more distinctive display face. Per DESIGN.md §7.
- **Phase 4:** polish, a11y/perf audit, deploy to Cloudflare Pages on synfin.xyz.
