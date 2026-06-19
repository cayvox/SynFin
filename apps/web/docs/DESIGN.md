# Synfin — Design System & Brand Identity

This is the **single source of truth** for the Synfin website's visual identity. Every
color, type, spacing, and motion decision must derive from this file. The goal is a site
that reads as a **$100B-grade institutional infrastructure company** — not a templated,
AI-generated "premium minimal" page. Read the "Anti-generic rules" section before building.

> Subject: **Synfin** — an open, neutral *best-execution aggregation layer* for the Canton Network,
> built **on top of** Canton's token standard (CIP-0056 / CIP-0112). It gathers quotes across venues,
> routes to the best price, and settles the split atomically — via the token standard's allocation /
> batch-settlement flow — with proven per-leg privacy. **It is an aggregation layer, not a venue, and
> not a competing settlement standard** (think 1inch / Jupiter, not a new token standard).
> Audience: Canton ecosystem engineers, venue operators, institutional integrators, the Canton Foundation.

---

## 0. The one idea (positioning the design must express)

**"The engraved instrument of best execution."** Synfin belongs to the world of *financial
securities and precision instruments* — engraving, seals, basis-point calibration — executed
with modern $100B-infra craft. This is the ownable territory (validated: Plaid's heritage /
engraving aesthetic is the most distinctive move in fintech; nobody else looks like it).

Two non-negotiable craft principles, from the best infra sites (Stripe / Linear / Vercel / Ramp / Mercury):
1. **Show the product, don't decorate.** Lead with a real, believable best-execution interface,
   not generative art. Demonstrate the defining quality (best route + atomic settlement + edge), don't claim it.
2. **Density is in behavior, not pixels.** Visually sparse, interaction-dense: every element has
   crafted hover / focus / disabled / loading states. Generous whitespace. Monochrome + ONE accent.

---

## 1. Color

Monochrome warm-neutral paper world + a single oxblood accent (the **Hermès principle**: one color
does all the work, used sparingly). No blue (that is Cayvox's color), no teal, no green, no yellow,
no glow.

```
--paper      #ECEBE5   /* page background — warm-neutral light, NOT cream-yellow */
--paper-2    #F3F2EC   /* lifted surfaces / cards */
--paper-3    #E4E3DC   /* recessed tracks, hover fills */
--ink        #19160F   /* primary text / solid fills — warm near-black */
--ink-2      #5A5448   /* secondary text */
--ink-3      #8C8678   /* tertiary text, captions, labels */
--line       #D4D2C7   /* hairline rules / borders */
--line-2     #C2BFB2   /* stronger hairline */
--seal       #8C2B1E   /* OXBLOOD — the sole accent */
--seal-2     #732116   /* oxblood pressed / active */
```

**Accent budget:** oxblood appears in **2–4 places per viewport, maximum** — the edge number,
the seal mark, the primary action on hover, one eyebrow dot. Everywhere else is ink/paper.
If oxblood is doing more than that, remove some.

**Contrast:** ink on paper is the workhorse and must stay high-contrast. ink-3 only for
genuinely secondary captions (never body copy).

---

## 2. Typography

A refined editorial **serif display** (institutional-finance gravitas, the engraving / securities
heritage) + a tight, cold **grotesk** (engineering craft) + a **mono** for all numerics
(precision dial / tabular data). Self-hosted (see STACK.md), never the Google CDN.

```
--font-display : "Newsreader", Georgia, serif;            /* hero + section headlines, the edge number */
--font-ui      : "Geist", system-ui, sans-serif;          /* body, UI, buttons, nav, the wordmark */
--font-mono    : "Geist Mono", ui-monospace, monospace;   /* all numbers, tickers, labels, code */
```

- **Display = Newsreader** (Production Type), used via the **variable font with
  `font-optical-sizing: auto`** so large headlines get the refined high-contrast display cut.
  Weights **400 / 500** + **italic 400** (for the emphasized word, e.g. *native*). Headlines:
  `line-height: .98–1.0`, `letter-spacing: -.012em`, max-width ≈13ch on hero. Edge number: 500.
- **Numbers are ALWAYS tabular** (`font-variant-numeric: tabular-nums`) — no layout shift on animate.
- Grotesk (Geist): tight tracking on UI (`letter-spacing: -.01em`); weights 400/500/600/700.
- Eyebrows / small labels: Geist 600, uppercase **only when short**, `letter-spacing` ~.04–.18em.
  Mono is for data, not chrome — avoid uppercase-mono-everywhere.

**Type scale (rem, 16px base):** 0.6875 / 0.75 / 0.8125 / 0.875 / 1 / 1.125 / 1.375 / 1.875 / 2.625 / 3.75 / 5.125.
Hero headline uses `clamp(48px, 5.6vw, 82px)`.

> ⚑ Newsreader is our premium display face — distinctive, editorial, on-concept, and self-hostable;
> a real step up from the now-common Instrument Serif. Keep `--font-display` a single, trivially
> swappable token. If budget ever allows, the apex is a **licensed** face (Klim Söhne / Signifier,
> Commercial Type Canela / Martina Plantijn) — a one-line swap. Heritage free alternative:
> Libre Caslon Display.

---

## 3. Spacing, grid, radius

- **8px base.** Scale: 4 8 12 16 20 24 32 40 56 72 96 128.
- **Whitespace rule:** take the spacing that feels like enough, then add ~50–100%. Sections breathe.
- Section vertical rhythm: ~96–128px desktop, ~56–72px mobile.
- Max content width: **1180px**, 32px gutters (16px mobile).
- **Radius is tight** (securities/infra, not friendly-SaaS): `--r: 3px` for controls/chips, `8px` for cards.
  Never large pill radii.
- Hairlines (`--line`) are 1px and do real structural work (dividers, plate edges, register marks).

---

## 4. The seal mark (logomark) — our signature, used for visual rhyming

A small **engraved seal / precision dial**: concentric rings + a radial tick ring (measurement),
an inscribed route curve entering and resolving to an **oxblood center dot** (the settlement).
Reads as both "securities seal" and "instrument dial."

Construction (render as inline SVG, 60×60 viewBox, center 30,30):
- outer ring r=26 stroke ink 1.2; inner ring r=21 stroke ink 0.7 opacity .5
- 48 radial ticks (every 4th long): long from r=17→22.5 width 1 opacity .85; short from r=19.5→22.5 width .6 opacity .45
- inscribed route path `M7 30 C 14 30, 16 22, 23 22 S 33 38, 30 30` stroke ink 1.3
- center dot r=3.2 fill **oxblood**

**Rhyme it across the site:** the same mark = favicon; a smaller variant marks section eyebrows;
the "settled" state shows a seal-check (the dial + an oxblood check). One shape, repeated quietly.

---

## 5. Components

### Nav
Seal mark + "Syn**f**in" wordmark in `--font-display` (the `f` glyph in oxblood). Right: 4 text
links (Geist 500, ink-2 → ink on hover) + a solid `Read the spec` CTA (ink → oxblood on hover).
Hairline bottom border. Height ~76–78px. Mobile: collapse to a `Menu` affordance.

### Buttons
- **Primary (`.b1`)**: ink fill, paper text, `--r`, Geist 600. Hover → oxblood + `translateY(-1px)`.
  Active → settle back. Focus-visible → 2px oxblood ring offset 3px. (Premium pass: add a subtle
  letterpress inner shadow.)
- **Secondary (`.b2`)**: paper, ink text, 1px `--line-2` keyline. Hover → ink keyline + faint fill.
- Every button has explicit hover / active / focus-visible / disabled states. No state left default.

### Product card — "Best execution" router (the hero centerpiece)
A believable best-execution interface (NOT generative art). Structure:
- **Header:** `Best execution` + a live pip (oxblood, slow pulse) + the pair `CC → USDCx` (mono).
- **Input row:** `You route` + the amount `250,000 CC` (mono, 30px, tabular) + `slippage 0.30%`.
- **Best route — split across 3 venues:** rows for `CantonSwap 46%`, `OneSwap 33%`, `RFQ desk 21%`,
  each with a small square venue mark, a percentage (mono), a thin allocation bar that **fills on
  load**, and the per-venue receive (`18,372 USDCx`, mono). Hover → row gets `--paper-3` fill.
- **Edge:** big `+47.8` in `--font-display` **oxblood** + `bps`, label "Edge vs the best single venue",
  and the absolute `≈ +191 USDCx · receive 39,940` (mono). The number counts up once on reveal, then locks.
- **Settlement state:** a seal-check mark + `Atomic settlement. All legs in one transaction — per-leg private.`
- **Footer action:** full-width `Route & settle` (ink → oxblood hover).
- Card: `--paper-2`, 1px `--line`, 8px radius, a restrained elevation shadow.
  (Premium pass: layered/crafted shadows, an inner highlight, a faint guilloché watermark behind it.)

### Basis-point tick rule
A horizontal engraved scale 0→120 bps with major/minor ticks (mono caps), an **oxblood marker +
triangle at the route's edge value**. Pure SVG. Encodes "basis-point precision" structurally.

### Ledger ticker (optional, surgical)
A slow horizontal marquee of venue quotes in `--font-mono` (e.g. `CantonSwap · CC/USDCx · 124.81`),
oxblood only on `best route · +47.8 bps`. Reads as a security's microprint / a tape. Pause on reduced-motion.

### Section eyebrow
Small oxblood dot/rule + Geist 600 label (e.g. `01 — The problem`). Use numbering **only** for the
"how it works" sequence (it is a real ordered process); elsewhere use a short label, no numbers.

### Footer
Hairline top border. `Synfin · stewarded by Cayvox Labs` · link row (Spec / GitHub / Docs / Cayvox) ·
`info@cayvox.com`. Quiet, mono or Geist 500.

---

## 6. Motion (GSAP)

Subtle, **physical**, purposeful — never decorative. Easing: `power3.out` /
`cubic-bezier(.22,1,.36,1)`. Durations 0.5–1.1s. Stagger 90–140ms.

- **Hero load timeline:** eyebrow → headline → sub → CTAs → card fade/translate in (small y, ~16px),
  staggered; then card allocation **bars fill** (1.1s, eased), the **edge number ticks up once** to
  +47.8 and locks, the **settle seal-check draws in**.
- **Scroll reveals:** sections rise (`y: 24 → 0`, opacity 0 → 1) on enter, staggered children. Once only.
- **Micro-states:** route-row hover, button hover/active, link underlines — all crafted, fast (120–160ms).
- **Ambient:** the live pip pulse; the ledger ticker. Nothing else loops.
- **`prefers-reduced-motion`:** kill all timelines/scroll-triggers, render the **final** state (bars
  full, edge = +47.8, everything visible). Ticker static. This is mandatory.

> Avoid the AI tells: no big procedural canvas/particle field as hero, no generic mesh-gradient,
> no floating 3D blobs, no glow. Motion demonstrates the product, or it doesn't ship.

---

## 7. Backgrounds & material (premium pass — phase 2, build hooks now)

Build the clean base first, but leave structural hooks for the premium layer:
- **Paper grain:** a very subtle film-grain/paper texture overlay (≤4–6% opacity) for material warmth.
- **Guilloché watermark:** a faint, large engraved guilloché rosette (real hypotrochoid line-art,
  rendered once to SVG/asset, ≤6% ink) behind the hero and select sections — the heritage signature,
  static and barely-there (texture, not a moving canvas).
- **Layered card material:** multi-stop, low-opacity shadows + a 1px inner highlight on `--paper-2`
  surfaces; hairline gradients *within* the monochrome (no chromatic gradients).
- **Engraved dividers:** section breaks as fine engraved rules with small register marks at the corners.
- Keep everything monochrome + oxblood. Premium = more *craft and depth*, never more color.

---

## 8. Anti-generic rules (read before every build)

The site must NOT read as AI-generated "premium minimal." Enforce:
1. **Real product over generative art.** The hero is the best-execution interface. No particle/canvas hero.
2. **Monochrome + ONE accent**, oxblood, ≤4 uses per viewport.
3. **Density in behavior:** every interactive element has crafted hover/focus/active/disabled/loading.
4. **Generous, confident whitespace.** When unsure, add space.
5. **Honest, specific copy** (see CONTENT.md). Specific > clever. No marketing fluff, no "first/only".
6. **Visual rhyming:** the seal mark + the tight `--r` + the tick motif recur quietly throughout.
7. **Tabular numerics**, hairline structure, real numbers — it should feel measured and instrument-grade.
8. **Quality floor, never announced:** responsive to mobile, visible keyboard focus, reduced-motion
   respected, fast (Lighthouse ≥95). Performance is itself a premium signal.
9. When a choice could be "the default any similar page would make," change it and note why.

---

## 9. Voice

Precise, institutional, confident, **honest**. Active voice. Name things by what they do.
We are the open best-execution **aggregation layer** on top of Canton's token standard — like 1inch
or Jupiter, **not a venue, and not a competing settlement standard**. We **adopt** CIP-0056 / CIP-0112
for settlement and **contribute** to the token standard's evolution; we don't reinvent it. We say
"proven," not "promised" — and only where it is literally proven (e.g. "10/10 on-ledger tests",
"settles via CIP-0056/0112"). We are complementary to venues, never "the first/only". Short
sentences. No hype, no emoji.
