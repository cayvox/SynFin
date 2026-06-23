/**
 * Canonical demo market: the SINGLE source of truth for the landing-page venue
 * data. The hero proof panel, the Problem price ladder, and the How-it-works
 * radar all read from here, so they can never disagree. Every derived figure
 * (best, spread, edge, per-venue gap) is computed in code, never hardcoded, so
 * the numbers are always internally consistent.
 *
 * Scenario: sell 320 CC into CC -> USDCx. Five venues quote USDCx per CC.
 * OneSwap is the best quote, so it is the winning route. The spread (best to
 * worst) is ~39 bps; the edge over the next best is ~11 bps. Both hold together.
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

/** How much CC the demo taker is selling. */
export const SELL_CC = 320;

/**
 * The five venue quotes (USDCx per CC). Order here is the canonical display
 * order (best to worst), but every derivation below sorts defensively so a
 * reorder can never break the winner/derived values.
 */
export const venues: Venue[] = [
  { name: 'OneSwap', price: 125.0 },
  { name: 'CantonSwap', price: 124.86 },
  { name: 'Cantex', price: 124.74 },
  { name: 'CompassSwap', price: 124.6 },
  { name: 'RFQ desk', price: 124.51 },
];

/** Typed indexed access (noUncheckedIndexedAccess-safe), throws if out of range. */
function at(list: Venue[], i: number): Venue {
  const v = list[i];
  if (!v) throw new Error(`market: venue index ${i} out of range`);
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

/** What the taker receives by routing the whole order to the best quote. */
export const receiveUSDCx = SELL_CC * best.price;

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

// ---- Centralized number formatting ---------------------------------------
/** Price, always 2 decimals. */
export const fmtPrice = (n: number): string => n.toFixed(2);
/** Basis points, 1 decimal by default (0 for compact spoke labels). */
export const fmtBps = (n: number, dp = 1): string => n.toFixed(dp);
/** Whole amounts with thousands separators. */
export const fmtAmount = (n: number): string =>
  n.toLocaleString('en-US', { maximumFractionDigits: 0 });
