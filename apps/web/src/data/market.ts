/**
 * Canonical demo market: the SINGLE source of truth for the landing-page venue
 * data. Every section (hero panel, Problem ladder, How-it-works radar, Privacy
 * legs, the settlement / split cards) reads from here, so the numbers can never
 * disagree. Everything is DERIVED in code from one price anchor, never hardcoded.
 *
 * Price scale: 1 CC = 0.15 USDCx. CC trades around fifteen cents, NOT ~$125, so
 * all quotes sit near 0.15 and every amount derives from ANCHOR_PRICE.
 *
 * Two order snapshots share the same venues/prices:
 *  - SMALL (hero panel + Problem): sell 320,000 CC; the whole order routes to the
 *    best quote (OneSwap). Edge over the next best venue is ~11.3 bps.
 *  - LARGE (Privacy + split / atomic sections): sell 250,000 CC; depth-aware
 *    split across all five venues, settled as one atomic transaction.
 */

export interface Venue {
  /** Display name. */
  name: string;
  /** Quote: USDCx per 1 CC. */
  price: number;
}

export const PAIR = 'CC / USDCx';
export const BASE = 'CC';
export const QUOTE = 'USDCx';

/** The price anchor: 1 CC = 0.15 USDCx. All quotes cluster around this. */
export const ANCHOR_PRICE = 0.15; // USDCx per CC (1 CC = $0.15)

/**
 * The five venue quotes (USDCx per CC), near the anchor. Listed best-first, but
 * every derivation sorts defensively so a reorder can never change the winner.
 */
export const venues: Venue[] = [
  { name: 'OneSwap', price: 0.15006 },
  { name: 'CantonSwap', price: 0.14989 },
  { name: 'Cantex', price: 0.14975 },
  { name: 'CompassSwap', price: 0.14958 },
  { name: 'RFQ desk', price: 0.14948 },
];

/** Typed indexed access (noUncheckedIndexedAccess-safe), throws if out of range. */
function at<T>(list: T[], i: number): T {
  const v = list[i];
  if (v === undefined) throw new Error(`market: index ${i} out of range`);
  return v;
}

/** Highest quote wins. Computed with reduce so there is no undefined to handle. */
export const best: Venue = venues.reduce((a, b) => (b.price > a.price ? b : a));
export const worst: Venue = venues.reduce((a, b) =>
  b.price < a.price ? b : a,
);

const byPriceDesc: Venue[] = [...venues].sort((a, b) => b.price - a.price);
export const ranked: Venue[] = byPriceDesc;
export const secondBest: Venue = at(byPriceDesc, 1);
/** Middle of the ranked list (for an odd count, the true median venue). */
export const median: Venue = at(
  byPriceDesc,
  Math.floor(byPriceDesc.length / 2),
);

const bps = (a: number, b: number): number => ((a - b) / b) * 1e4;

/** Total price dispersion across venues (best vs worst). */
export const spreadBps = bps(best.price, worst.price);
/** Edge of the winner over the next best venue. */
export const edgeVsNextBps = bps(best.price, secondBest.price);
/** Edge of the winner over the median venue. */
export const edgeVsMedianBps = bps(best.price, median.price);

/** How far a venue's quote sits behind the best, in bps (0 for the winner). */
export const gapBehindBestBps = (v: Venue): number => bps(best.price, v.price);

/** Position of a price on a shared worst..best scale, as 0..1. */
export const pricePosition = (price: number): number =>
  worst.price === best.price
    ? 1
    : (price - worst.price) / (best.price - worst.price);

export const isBest = (v: Venue): boolean => v.name === best.name;

// ---- SMALL order snapshot (hero panel + Problem) --------------------------
/** Taker sells this much CC; the whole order routes to the best quote. */
export const SELL_CC = 320_000;
/** What the taker receives routing the whole small order to the best quote. */
export const receiveUSDCx = SELL_CC * best.price;

// ---- LARGE order snapshot (Privacy + split / atomic sections) -------------
/** Taker sells this much CC; depth-aware split across all five venues. */
export const LARGE_SELL_CC = 250_000;

/** Depth-aware allocation per venue (fractions, sum to 1), best venue largest. */
const ALLOC: Record<string, number> = {
  OneSwap: 0.33,
  CantonSwap: 0.27,
  Cantex: 0.2,
  CompassSwap: 0.13,
  'RFQ desk': 0.07,
};

export interface Leg {
  name: string;
  price: number;
  /** Allocation fraction (0..1). */
  alloc: number;
  /** Allocation as a percentage (0..100). */
  sharePct: number;
  /** CC routed to this venue. */
  inCC: number;
  /** USDCx received from this leg. */
  outUSDCx: number;
  best: boolean;
}

/** Per-venue legs for the large order, ranked best-first. */
export const legs: Leg[] = ranked.map((v) => {
  const alloc = ALLOC[v.name] ?? 0;
  const inCC = alloc * LARGE_SELL_CC;
  return {
    name: v.name,
    price: v.price,
    alloc,
    sharePct: alloc * 100,
    inCC,
    outUSDCx: inCC * v.price,
    best: isBest(v),
  };
});

/** Total USDCx received across all legs of the large order. */
export const largeTotalOut = legs.reduce((s, l) => s + l.outUSDCx, 0);
/** Effective blended price of the large routed order (USDCx per CC). */
export const largeBlendedPrice = largeTotalOut / LARGE_SELL_CC;
/** The winner's leg in the large order. */
export const bestLeg: Leg = at(
  legs.filter((l) => l.best),
  0,
);

// ---- Centralized number formatting ----------------------------------------
/** Price near the anchor, 5 decimals as quoted (e.g. 0.15006). */
export const fmtPrice = (n: number): string => n.toFixed(5);
/** Basis points, 1 decimal by default (0 for compact spoke labels). */
export const fmtBps = (n: number, dp = 1): string => n.toFixed(dp);
/** Whole amounts with thousands separators (e.g. 37,462). */
export const fmtAmount = (n: number): string =>
  n.toLocaleString('en-US', { maximumFractionDigits: 0 });
