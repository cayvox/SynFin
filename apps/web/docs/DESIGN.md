# Synfin — Design System (Dark / Cinematic)

> Subject: **Synfin** — the open, neutral *best-execution aggregation layer* for the Canton Network,
> built **on top of** Canton's token standard (CIP-0056 / CIP-0112). Like 1inch / Jupiter, **not a venue,
> and not a competing settlement standard.** Audience: Canton ecosystem engineers, venue operators,
> institutional integrators, the Canton Foundation.
>
> **Aesthetic:** dark, cinematic, institutional — a precision instrument under studio light at night.
> Light = clarity = best execution. Restraint + dimensionality. The visual proof has been rendered and
> approved (see `reference/synfin-dark-hero.png`). Match that craft for EVERY section: same depth,
> same premium, same restraint. No section may drop below the hero's bar.

This is the source of truth. Do not contradict it. Pair with CONTENT.md (copy) and STACK.md (build).

---

## 0. The one idea

A nocturnal trading-floor / observatory. A faint constellation of Canton venues, connected by thin
luminous routing lines that converge into the **best route**. Warm **ember** is the only accent —
oxblood evolved for the dark — used sparingly at payoff + brand moments. Everything else is a warm-grey
monochrome on warm near-black. Anti-generic: every visual maps to Synfin's real function (routing across
real venues to best execution); never decorative neon.

---

## 1. Color (exact tokens → CSS custom properties)

```
/* canvas — warm near-black, never clinical #000 */
--bg-0:#070708;   /* page */
--bg:#0B0B0D;     /* hero panel base */
--bg-1:#121316;   /* cards */
--bg-2:#191A1E;   /* raised card / inputs */
--bg-3:#202126;   /* hover surface */

/* ink — warm-grey ramp */
--ink:#F1EFEA;    /* primary (warm white) */
--ink-2:#A8A59D;  /* secondary */
--ink-3:#6F6C64;  /* faint / muted headline tone */

/* lines — hairline light */
--line:rgba(241,239,234,.10);
--line-2:rgba(241,239,234,.16);
--line-3:rgba(241,239,234,.06);

/* accent — ember (the ONLY accent) */
--ember:#CC6A43;
--ember-hi:#E68A5E;     /* hover / line terminus */
--ember-soft:rgba(204,106,67,.55);
--ember-glow:rgba(204,106,67,.16);

/* on-light (for the white primary button) */
--on-light:#0B0B0D;
```

Rules: monochrome + ONE accent (ember). **Ember budget ≤ 4 instances per viewport** (e.g. seal center,
edge/payoff number, best-route line+marker, one live dot). EXCEPTION: the §3 router orbital is a
deliberate "ember-instrument" that runs hot (~17 ember marks: meter + 3 route lines + core dot + 3
route-node rings + 3 prices + 3 shares + arc) — intentional and documented; the ≤4 budget applies to
general sections, not the orbital. NO blue/teal/green/purple/cyan. NO saturated
neon. NO multi-color gradients. Color comes from *light* (cool-white washes) and the single warm accent.

---

## 2. Typography

```
--font-display:'Mona Sans', system-ui, sans-serif;   /* headlines, big stats */
--font-ui:'Geist', system-ui, sans-serif;             /* body, UI, buttons, nav, wordmark */
--font-mono:'Geist Mono', ui-monospace, monospace;    /* ALL numbers, tickers, labels, code (tabular-nums) */
```
- **Mona Sans** (GitHub, OFL, self-hosted) — a "considered modern" grotesque with warmth; deliberately
  NOT Inter. Headline weight **600**, tight tracking. (Swappable via `--font-display` if we license a
  premium face later, e.g. PP Neue Montreal.)
- **Geist** / **Geist Mono** (self-hosted) — UI + data. Mono always `font-feature-settings:"tnum"` /
  `font-variant-numeric: tabular-nums`.

Type scale (desktop; fluid down):
- Display XL (hero h1): 90px / line-height .97 / tracking -.035em / 600
- Display L (section h2): 52–60px / 1.02 / -.025em / 600
- Display M (card title): 26–30px / 1.1 / -.015em / 600
- Body L (hero sub): 19px / 1.5 / 400 / --ink-2
- Body: 16px / 1.6 / 400
- Label / eyebrow: 13px / .02em (mono or ui)
- Mono data: 12.5–13px / .02em ; big mono stat: 30–48px / 500 / tabular
- Tonal headline move: split the line — primary clause in `--ink`, secondary clause in `--ink-3`
  (e.g. "Best execution," in ink / "native to Canton." in muted). One muted clause max.

---

## 3. Space / radius / motion tokens

```
--r-pill:999px; --r-card:18px; --r-sm:11px; --r-xs:8px;
--maxw:1240px; --gutter:30px; (16px mobile)
section padding block: 120–148px desktop / 72–88px mobile
--e-out:cubic-bezier(.22,.61,.36,1);  --e-inout:cubic-bezier(.65,.05,.36,1);
--d-fast:.18s; --d:.4s; --d-slow:1.1s;
```

---

## 4. Logomark — the routing instrument (carries the brand into dark)

SVG, drawn in light strokes on dark, with an **ember center**. Single source → nav logo, favicon, and
the settlement "seal-check".
- Outer ring r=21.5, stroke `rgba(241,239,234,.5)` 1px; inner ring r=15, stroke `…/.28` 1px.
- **48 radial ticks** (4px) around the dial, `rgba(241,239,234,.5)` (instrument bezel). (Proto shows 12;
  ship the full 48, evenly spaced.)
- An inscribed **route path** (a gentle bezier arc) across the dial, `rgba(241,239,234,.45)` 1.3px.
- **Center dot** r=2.6, fill `--ember`.
- Wordmark: "Synfin" in `--font-display` 600, `--ink`. Wordmark stays fully monochrome (no colored letter).

---

## 5. Components

**Pill nav (centered, dark glass):** logo left · centered pill (`rgba(20,21,25,.66)`, `1px --line`,
`backdrop-filter: blur(14px)`, radius pill) with links (`--ink-2`, hover `--ink` + `rgba(255,255,255,.05)`
bg) + a 1px divider + "Spec ↗" · right: "GitHub" + primary button.

**Buttons (pill):**
- Primary: bg `--ink` (#F1EFEA), text `--on-light`, inset top highlight + soft drop shadow; hover → `#fff`.
- Ghost: bg `rgba(241,239,234,.03)`, text `--ink`, border `--line-2`; hover bg `…/.07`.
- All: `--font-ui` 500, radius pill, focus-visible 2px ember-tinted ring + offset.

**Dark-glass card / bento:** bg `--bg-1`, `1px --line`, radius `--r-card`, **inset top highlight**
`0 1px 0 rgba(241,239,234,.06) inset`, soft outer shadow `0 24px 60px -30px rgba(0,0,0,.8)`, and a faint
internal radial glow where the card is "lit". Bento = a 12-col grid of these at mixed spans (see §8/§ sections).
Cards may contain: big mono stat, a small chart, tag pills, a mini diagram. Hover: border → `--line-2`,
a touch more lift. Never flat pure-black boxes; always the lit-glass material.

**Stat number:** `--font-mono` 500, tabular, large (30–48px), `--ink`; unit/label in `--ink-2` mono small.
The single hero/proof payoff number (+47.8 bps) is `--ember`.

**Tag pill:** small (12px ui/mono), `rgba(241,239,234,.03)` bg, `1px --line`, radius pill, `--ink-2`.

**Node (constellation):** 32px circle, bg `radial-gradient(circle at 50% 35%, rgba(241,239,234,.10),
rgba(20,21,25,.7))`, `1px --line-2`, soft shadow; inner ring i = 9px, `1.25px --ink-2`; **route nodes**:
inner ring border `--ember` + faint ember glow. Label: name (`--ink` 14px ui 500) + quote
(`--font-mono` 12.5px `--ink-2`, the price in `--ember` for route nodes). Left/right label alignment by side.

**Scroll / slide indicator:** mono caps `--ink-3` ("01 / 03 · SCROLL") + a 34px ring arrow.

**RouterCard (re-skin for dark):** the detailed best-execution card — now a **dark-glass card living in the
Proof/bento section (NOT the hero)**. Contents unchanged from CONTENT.md (250,000 CC → 46/33/21 split,
+47.8 bps edge, atomic per-leg-private), restyled on `--bg-1`/`--bg-2` glass, mono numbers, ember only on
the +47.8 edge and the seal-check. Allocation bars: track `--line`, fill warm-white `--ink` (NOT ember),
animate 0→pct. No fake "live" pulse.

---

## 6. Signature motif — the routing constellation + LINE SPEC (read carefully — this is what must look pro)

Venue nodes placed around the composition's periphery; thin luminous lines connect them and the
**best-route** venues converge to a central "best route · +47.8 bps" marker. Lines are the make-or-break
craft detail — they must be **thin, faded, elegant hairlines (reference-grade), NOT glowing neon lasers.**

Implementation (validated values):
- One SVG sized to the panel; lines use `vector-effect:non-scaling-stroke` so they stay crisp ~1px at any
  size, and `stroke-linecap:round`. If the SVG stretches (`preserveAspectRatio="none"`), non-scaling-stroke
  is required. Prefer sizing the SVG to the panel and keeping node coords in the same space so endpoints
  meet node centers exactly.
- **Neutral network arcs** (periphery, the "considered" connections): stroke = a horizontal/edge
  **fade gradient** `#F1EFEA` 0 → .12 → 0 (so the line fades in/out at its ends), 1px. Some secondary
  links dotted `rgba(241,239,234,.07)` `stroke-dasharray:1.5 7`.
- **Ember best-route lines** (the chosen split — CantonSwap + OneSwap + RFQ desk → convergence): stroke =
  a **vertical fade gradient** `#CC6A43` 0% @0 → 40% @.30 → 100% `#E68A5E` @.58 (fades from the node,
  strengthens toward convergence), width 1.1px, and a **very subtle** glow (`feGaussianBlur stdDeviation
  1.1` merged under) — NOT bloom. No thick strokes, no heavy blur, no saturated glow.
- Curves: smooth single-bezier, gentle; route them around the central text column (down the gutters,
  along the lower third) — never across headline letterforms or the subhead.
- Optional motion: a slow line-draw on load (stroke-dashoffset), and a faint "flow" pulse along the ember
  route (a short bright dash traveling the path, low opacity). Reduced-motion: static, fully drawn.

Convergence marker: small mono pill, ember text + 1px `--ember-soft` border + `rgba(204,106,67,.07)` bg +
soft ember halo: "● best route · +47.8 bps".

---

## 7. Atmosphere — volumetric light + grain (layered, never one neon blob)

On the hero panel (and reused subtly per section), layer soft radial washes — NOT a single blob:
```
/* cool key light, soft upper-right wash (no hard seam / no conic banding) */
radial-gradient(52% 46% at 66% 12%, rgba(228,232,240,.24), rgba(228,232,240,.08) 42%, transparent 70%),
radial-gradient(42% 56% at 50% 26%, rgba(212,218,228,.10), transparent 64%),
radial-gradient(34% 82% at 84% -4%, rgba(228,232,240,.11), transparent 58%);
/* warm ember underglow near the route convergence */
radial-gradient(34% 30% at 50% 92%, var(--ember-glow), rgba(204,106,67,.05) 45%, transparent 70%);
```
- Panel: large radius (26px), `1px --line`, inset top highlight, deep outer shadow; page bg `--bg-0`.
- **Film grain** overlay: tiny SVG `feTurbulence` data-URI, `opacity:.05`, `mix-blend-mode:overlay` — for
  material depth. Keep it faint.
- Per-section: a quieter version (one soft wash + optional faint ember) so the whole page feels lit, not
  just the hero. Avoid repeating the exact same blob; vary position/intensity.

---

## 8. Hero composition (the approved layout)

Centered text column, clear of all lines; venue nodes at the periphery; convergence marker low-center.
- Eyebrow pill: "● Open best-execution layer · Canton" (ember dot).
- h1 (Display XL): "Best execution," (`--ink`) / "native to Canton." (`--ink-3` muted) — two lines.
- Sub (Body L, max 600px, centered): the CONTENT.md §1 subhead.
- CTAs: primary "Read the spec ↗" + ghost "View on GitHub".
- Convergence marker low-center: "● best route · +47.8 bps".
- Node positions (in a 1440×856 space; convert to %): CantonSwap (187,222) · OneSwap (173,548) ·
  CompassSwap (432,736) · Cantex (1253,222) · RFQ desk (1267,548) · convergence (720,736). Route nodes =
  CantonSwap, OneSwap, RFQ desk.
- Bottom band: left scroll indicator "01 / 03 · SCROLL"; right proof tag "● built on CIP-0056 / 0112 ·
  10/10 on-ledger tests".
- Mobile: nodes reduce to a tasteful subset or collapse below the headline; the constellation must
  degrade gracefully (never a tangle). Headline reflows; text column centered.

## 8b. Section architecture (build ALL at the hero's bar)

Same dark-glass material, layered light, ember restraint, mono data — every section. Copy from CONTENT.md.
1. **Hero** — constellation (above).
2. **Proof / "Insights" bento** — a bento grid of dark-glass cards: the **RouterCard**, the **+47.8 bps**
   edge stat, a **per-leg-privacy** mini-diagram, **10/10 on-ledger tests**, a **CIP-0056/0112** badge,
   a **venue-split** chart (46/33/21). Mixed spans, lit glass, one ember payoff.
3. **How it works** — the 5-stage route→atomic-settlement as an elegant **orbital / flow** visual
   (a luminous arc/dial or a horizontal flow of lit nodes); restrained, not a gimmick.
4. **Per-leg privacy** — interactive reveal: hover a venue → it sees only its own leg (compartmentalized).
5. **How venues plug in** — Mode A (atomic-allocation via CIP-0056/0112) vs Mode B (managed-deposit),
   two lit-glass columns.
6. **Open by design** — 1inch / Jupiter precedent; open vs built-on-top split.
7. **Ecosystem** — venues / wallets / institutions cards.
8. **Footer** — seal mark + "stewarded by Cayvox Labs" + links + info@cayvox.com · Open · Apache-2.0.

---

## 9. Motion

Atmospheric and slow. Hero load: eyebrow → headline → sub → CTAs → nodes/lines draw → edge count-up to
+47.8 (once, tabular, locks). Slow drifting light; subtle parallax on the constellation with pointer.
Section reveals on scroll (fade + small rise, staggered). Progressive enhancement: **content visible by
default; animation only enhances** (hidden pre-state under an `.is-animatable` class added by JS only when
GSAP is present AND motion is allowed; `clearProps` on complete). `prefers-reduced-motion` → final state,
no flash, no drift, line-draw skipped (lines shown drawn). Never hide content behind JS that may not run.

---

## 10. Anti-generic guardrails (dark-specific)

- NO single neon radial blob; light is layered + directional.
- NO saturated neon (purple/cyan/green/blue). One warm ember accent only, sparse.
- NO Inter. NO stock 3D coins / blockchain cubes / particle soup / matrix rain.
- Lines must be thin, faded, elegant (see §6) — never thick glowing lasers.
- Every visual maps to Synfin's real function (real venues, real routing, real edge, real settlement).
- Restraint: ember ≤ 4/viewport; whitespace generous; cards are lit glass, not flat boxes.
- If a choice is "what any dark SaaS would do," change it and note why.

## 11. Voice

Precise, institutional, confident, **honest**. Active voice. We are the open best-execution **aggregation
layer** on top of Canton's token standard — like 1inch/Jupiter, not a venue, not a competing settlement
standard. We **adopt** CIP-0056/0112 and **contribute** to it. "Proven" only where literally proven
(10/10 on-ledger tests; settles via CIP-0056/0112). Complementary to venues, never "first/only". Numbers
are illustrative unless explicitly from tests/spec; never imply measured/live production data.

---

## 12. Detailed build specs — §2 "The problem" + §3 "How it works" (variant A, approved)

Reference render for §3: `reference/synfin-flow.png` (+ `reference/synfin-flow.html` for exact line/coord/
values). Port the structure + line treatment into clean Astro; improve (responsive, motion); match the PNG.

### §2 — The problem (a calm editorial breather BEFORE the flow)
- Eyebrow: `01 — The problem`. Heading (tonal): "Canton has a token standard." (`--ink`) +
  "It doesn't have a best-execution layer — yet." (`--ink-3` muted). Display L (~46–52px).
- Body (CONTENT.md §2): the lead + two supporting paragraphs, in a refined max-width column
  (~620px), `--ink-2`, generous leading. Left-aligned editorial; lots of space; quiet.
- Pull-stat (lit-glass or inline, mono): `1 token standard` · `0 best-execution layers` — the "0" may
  carry the single ember accent. One ember max in this section.
- OPTIONAL subtle visual (keep faint, right side or background): a few **disconnected** venue dots with
  NO connecting lines — a deliberate contrast to the hero's connected route ("today: fragmented, no
  layer"). Must stay quiet; if it adds noise, omit. §2 is a breather, mostly type.
- Quiet §7 atmosphere (one soft wash). No hero blob.

### §3 — How it works (the ORBITAL — approved variant B1)
Reference render: `reference/synfin-orbital.png` (+ `synfin-orbital.html` for exact coords/values).
The story the visual MUST tell (this is what keeps it from being generic): Synfin's router scans every
Canton venue at once, locks the best route (a split across the chosen venues), and settles it
atomically — real venues, real quotes, the real 46/33/21 split, the real +47.8 bps edge. Not a
decorative orbit.

Layout — a 2-column editorial split (max-width 1320, gap ~40, align center):
- LEFT (~0.82fr) copy: eyebrow `02 — How it works`; tonal h2 "One engine." (--ink) + "The whole market."
  (--ink-3 muted), Display L (~50px); a ~42ch intro (CONTENT §3 adapted: "Synfin scans every Canton
  venue at once, locks the best route — one venue or a split across several — and settles it atomically,
  with per-leg privacy."); then a 4-row step list separated by hairline top/bottom borders, each row:
  mono number + title (Display M ~16px) + one-line desc (--ink-2): 01 Intent · 02 Quote · 03 **Route &
  settle** (active — title in ember) · 04 Edge (+47.8 bps vs the best single venue). Copy from CONTENT §3.
- RIGHT (1fr) the ORBITAL (~560×560, square — lock aspect, render uniformly; do NOT stretch):
  • Concentric instrument rings: r=250 (faint `rgba(241,239,234,.07)`) with **12 bezel ticks**
    (`…,.16`, 8px), r=170 (the venue orbit, `…,.10`), r=108 (faint `…,.06`).
  • Center **router core** = the SealMark instrument scaled (~104px: rings + 8 ticks + route bezier) with
    an **ember center dot** (r≈5.5 #CC6A43 + a faint ember ring) and a soft **ember radial glow** behind
    (~300px, `--ember-glow`). Keep the center clean (no caption — state lives in the meter + the steps).
  • **Top meter arc** (best route locked): an ember arc at r≈235 spanning ~120° over the top
    (`M76.5,162.5 A235,235 0 0 1 483.5,162.5` in the 560 box), `url(#arc)` ember gradient ~2px, a small
    ember head dot near its right end; and a centered pill above the orbital:
    "● best route · +47.8 bps · locked" (ember, soft halo).
  • **5 venue nodes** on the r=170 orbit (coords in the 560 box): CantonSwap (154,166) · OneSwap (120,338)
    · RFQ desk (440,338) — these three are the **route** (ember inner ring + ember price); Cantex (406,166)
    · CompassSwap (280,450) — **scanned, not chosen** (neutral). Each node = 28px lit ring + name (--ink
    12.5px) + mono quote (--ink-2; route price in ember). Labels sit just outside each node; keep clear of
    the rings/lines.
  • **Route lines**: ember, core→the 3 chosen venues, gentle bows (`#CC6A43` ~.5, 1.1px, subtle blur
    stdDeviation ~1.0, NO bloom), with small ember mono **share labels 46 / 33 / 21** placed on each line
    (clear of the core seal and of the node quotes). Faint dotted neutral lines core→the 2 scanned venues.
  • Ember discipline: meter + 3 route lines + core center + 3 share labels + the active step — restrained,
    warm-on-dark, no saturated/neon, no bloom.

Motion: on scroll-in — rings fade in; the meter arc draws (stroke-dashoffset) and "+47.8" counts up once
(tabular, locks); route lines draw from the core outward; venue nodes fade/scale in staggered; an
optional faint scan sweep. Slow, subtle. The outer ring MAY rotate very slowly (motion-allowed only).
PE: content visible by default; reduced-motion + JS-off → final state (arc + lines fully drawn, +47.8
shown), no flash/blink. Lines/arc gradients on near-horizontal/vertical spans → `userSpaceOnUse` (or solid).

Responsive: desktop = the 2-col split (match PNG). ≤~960: stack — copy on top, orbital centered below,
scaled (~420px) with labels still legible. ≤~560: orbital simplifies (may drop the faint scanned lines /
shrink further) but keeps the core + the 3 route venues + the meter readable; NO clipping, NO horizontal
scroll, clean order.

---

## 13. Detailed build specs — §4 Per-leg privacy + §5 How venues plug in (approved renders)

Page order (these come AFTER the Proof bento): Hero → §2 Problem → §3 How-it-works → Proof bento →
§4 Privacy → §5 Venue modes → (§6 Open → §7 Ecosystem → Footer, later).

### §4 — Per-leg privacy (eyebrow `04 — Confidentiality`, CONTENT §5) — MATCH `reference/synfin-privacy.png`
A 2-column split (max-width 1320, gap ~56, align center):
- LEFT (~0.78fr): eyebrow; tonal h2 "Each venue sees" (--ink) + "only its own leg." (--ink-3 muted),
  Display L; a ~44ch lead (CONTENT §5 — executor coordinates the atomic tx; each venue's view is
  compartmentalized; no public mempool → no front-running surface); then the honest caveat in --ink-3
  with a left hairline rule: "Per-leg confidentiality ≠ anonymity to your own counterparty. A venue does
  not see other venues' legs; it still sees its own."
- RIGHT (1fr): a lit-glass `.card` containing the privacy diagram:
  • **Executor bar** (top): a rounded row, faint ember tint, with a small ember seal dot + "Executor —
    Synfin coordinator" + "submits one atomic transaction · sees the whole route", and a right-aligned
    mono ember tag "250,000 CC → 39,940 USDCx".
  • **Ember connector** (thin, ~1.1px, .5, subtle): from the executor center fanning down to the 3 lanes.
  • **3 lane cards** (grid, gap 12): the MIDDLE lane = "OneSwap — your leg" is the visible one (ember
    header tint, eye icon "visible"), showing real mono data — share **33%** (ember) · in **82,500 CC** ·
    out **13,181 USDCx** · price **124.63** — and a footer "● you see only this leg" (ember). The OTHER
    two lanes (CantonSwap, RFQ desk) = "sealed" (lock icon), their bodies are **redacted hatched bars**
    (repeating-linear-gradient at low alpha) + a footer "⦰ hidden from you" (eye-off, --ink-3).
  • Numbers must stay consistent with the bento/constellation (OneSwap 33% / 13,181 USDCx / quote 124.63;
    82,500 CC = 33% of 250,000). Illustrative demo — never label measured/live.
- Quiet §7 atmosphere. Motion: lanes + executor reveal on scroll; the "visible" lane's numbers may fade
  in; redacted bars static. PE: reduced-motion/JS-off → final state, no flash.
- Responsive: ≤~960 stack copy over the diagram; lanes stay 3-up as long as they fit, else 1-up stacked
  (your leg first), no clipping, no h-scroll.
- OPTIONAL interactivity (progressive enhancement, desktop): hovering a venue node elsewhere could focus
  its lane — but the DEFAULT static state already tells the story (your leg visible, others sealed). Keep
  the static render faithful first.

### §5 — How venues plug in (eyebrow `05 — Architecture`, CONTENT §6) — MATCH `reference/synfin-modes.png`
Centered, max-width ~1180:
- Head: eyebrow `05 — Architecture`; tonal h2 "Two settlement modes." (--ink) + "One adapter interface."
  (--ink-3 muted), Display L.
- Two `.card` columns (grid 1fr 1fr, gap 20):
  • **Mode A — Atomic-allocation** (the card gets a faint **ember** border + ember top-glow; badge
    "atomic" ember): label "settlementMode"; title "Atomic-allocation"; sub "The venue co-settles through
    the token standard's allocation flow. Eligible for Synfin's atomic, per-leg-private settlement.";
    3 ember-check feature rows (hairline-separated): **Atomic co-settlement** — all legs in one
    transaction · **Per-leg privacy** — each venue sees only its leg · **All-or-nothing** — settles via
    CIP-0056 / 0112; a mono code chip `settlementMode: 'atomic-allocation'` (value in ember).
  • **Mode B — Managed-deposit** (neutral card; badge "deferred" neutral): title "Managed-deposit"; sub
    "Quote-and-deposit venues. Synfin still aggregates their quotes, but execution is deferred and settles
    separately."; 3 neutral feature rows with distinct icons (＋ Quote & deposit — included in routing ·
    ◷ Deferred execution — not same-transaction · ✕ Non-atomic — outside the all-or-nothing guarantee);
    code chip `settlementMode: 'managed-deposit'` (neutral value).
- **Honest note** below (lit row, ember dot): "**Atomic settlement is valid only when every leg is Mode A**
  — the router enforces it. Honest status: most accessible Canton venues today are `managed-deposit`, and
  CIP-0112's native batch settlement is rolling out. Quote aggregation works across both now; the atomic
  path turns on as venues adopt the allocation flow."
- Quiet §7 atmosphere. Motion: cards reveal on scroll (staggered). PE: reduced-motion/JS-off → final
  state, no flash.
- Responsive: ≤~860 the two cards stack 1-col (Mode A first); the note reflows; no clipping/h-scroll.

---

## 14. Detailed build specs — §6 Open by design + §7 Ecosystem (approved renders)

Page order (after §5 venue modes): … → §5 Modes → §6 Open by design → §7 Ecosystem → Footer.

### §6 — Open by design (eyebrow `06 — Open & neutral`, CONTENT §7) — MATCH `reference/synfin-open.png`
2-col split (left ~0.84fr copy, right 1fr stack diagram, gap ~56, align center):
- LEFT: eyebrow; tonal h2 "An aggregation layer," (--ink) + "not a new standard." (--ink-3 muted),
  Display L; ~46ch lead (the 1inch/Jupiter precedent → "Synfin is that layer for Canton" → adopts
  CIP-0056/0112 + contributes; bold the key phrases); open-property **chips** row: "Open · Apache-2.0"
  (ember chip) · "Neutral — no venue of our own" · "Self-hostable" · "Adopts & contributes to
  CIP-0056/0112"; then the neutral one-liner (left hairline rule, --ink-3): "Synfin holds no liquidity
  and favors no venue. It is neutral infrastructure on top of the token standard."
- RIGHT: a lit-glass `.card` **stack diagram** (the architecture — this is the anti-generic element):
  • top caption (mono, centered): "1inch — EVM · Jupiter — Solana · **Synfin — Canton**" (Synfin in ember).
  • a row of 5 **venue chips** (CantonSwap/OneSwap/CompassSwap/Cantex/RFQ desk) with thin neutral
    connectors fanning DOWN into…
  • the **Synfin layer** card (ember-tinted, ember title, badge "aggregation layer"): "Synfin" +
    "aggregates quotes · routes to best price · settles the split atomically".
  • a "↑ settles via ↑" connector label, resting on…
  • the **Canton Network layer** card (neutral, badge "settlement rail"): "Canton Network" + "token
    standard · CIP-0056 / 0112".
  Reads top-to-bottom: venues → Synfin aggregation layer → Canton token standard. Ember only on the
  Synfin layer + the analogy's Synfin + the Apache chip.
- Quiet §7 atmosphere. Motion: reveal on scroll (chips → layers → connectors draw). Responsive: ≤~960
  stack copy over the diagram; chips wrap; the two layer cards stay full-width; no clip/h-scroll.

### §7 — Ecosystem (eyebrow `07 — Who it's for`, CONTENT §8) — MATCH `reference/synfin-eco.png`
Centered (max-width ~1180): eyebrow `07 — Who it's for`; tonal h2 "Built for everyone" (--ink) +
"routing on Canton." (--ink-3 muted), Display L. Three lit-glass `.card` columns (grid repeat(3,
minmax(0,1fr)), gap 20, left-aligned text):
- **Venues** (icon: building/exchange): "Implement **one adapter** and become reachable through every
  Synfin integration — more flow, no new counterparties to chase." meta "● one adapter · every integration".
- **Wallets & apps** (icon: wallet): "**One SDK** for best-execution swaps across all of Canton's
  liquidity — drop it in and route every trade to the best price." meta "● one SDK · all of Canton".
- **Institutions** (icon: columns/bank): "**Best execution** with settlement atomicity and per-leg
  confidentiality — provable, to the basis point, on neutral open infrastructure." meta "● provable
  best-ex · per-leg private".
  Each card: 44px rounded icon tile (lit, neutral stroke) + Display-M title + ~14.5px --ink-2 body (bold
  key phrase) + a mono meta line (ember dot, --ink-3) above a hairline.
- Honest **Canton context** line below (centered, --ink-3, ~64ch): "**Canton is where regulated,
  institutional liquidity is moving on-chain — on a common token standard.** Synfin is the neutral
  best-execution layer on top of it." (no overclaiming).
- Quiet §7 atmosphere. Motion: cards reveal staggered. Responsive: 3→2→1 col (minmax(0,1fr), min-width:0
  on cards), no clip/h-scroll.
