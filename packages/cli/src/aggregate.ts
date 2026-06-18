import { route } from '@synfin/router-ref';
import {
  Decimal,
  isQuoteRejection,
  type Quote,
  type QuoteRejection,
  type QuoteRequest,
  type RouteResult,
  type SwapIntent,
  type VenueAdapter,
} from '@synfin/spec';

/**
 * Cross-venue quote aggregation (Demo 1). Pure with respect to the injected
 * adapters and clock: given a set of {@link VenueAdapter}s and a
 * {@link SwapIntent}, it gathers one quote per venue, runs the reference router
 * over the gathered quotes, and reports the chosen route and the **edge**
 * (improvement of the routed receipt over the best single venue).
 *
 * No settlement, no funds: it only calls each adapter's `quote()`. A transport
 * failure on one venue becomes a typed outcome for that venue and never aborts
 * the aggregation (ARCHITECTURE.md §6).
 */

/** One venue's outcome for the intent. */
export interface VenueOutcome {
  readonly venueId: string;
  readonly settlementMode: VenueAdapter['settlementMode'];
  readonly quote: Quote | null;
  readonly rejection: QuoteRejection | null;
}

export interface AggregateResult {
  readonly intent: SwapIntent;
  readonly outcomes: readonly VenueOutcome[];
  readonly quotes: readonly Quote[];
  readonly route: RouteResult;
  /** Best single-venue quote by receive amount (null if none quoted). */
  readonly bestSingle: {
    readonly venueId: string;
    readonly receive: string;
  } | null;
  /** Routed receipt improvement over the best single venue, in bps (null if none). */
  readonly edgeBps: number | null;
}

function quoteRequestFor(intent: SwapIntent, venueId: string): QuoteRequest {
  return {
    intentRef: intent.intentId,
    give: { asset: intent.give.asset, amount: intent.give.amount },
    want: { asset: intent.want.asset },
    deadline: intent.deadline,
    nonce: `${intent.intentId}:${venueId}`,
  };
}

async function quoteVenue(
  adapter: VenueAdapter,
  intent: SwapIntent,
): Promise<VenueOutcome> {
  const base = {
    venueId: adapter.venueId,
    settlementMode: adapter.settlementMode,
  };
  try {
    const result = await adapter.quote(
      quoteRequestFor(intent, adapter.venueId),
    );
    return isQuoteRejection(result)
      ? { ...base, quote: null, rejection: result }
      : { ...base, quote: result, rejection: null };
  } catch (err) {
    // Transport/timeout failure: surface as a typed outcome, never throw.
    const message = err instanceof Error ? err.message : 'transport error';
    return {
      ...base,
      quote: null,
      rejection: { venueId: adapter.venueId, code: 'transport_error', message },
    };
  }
}

const TEN_K = Decimal.parse('10000') as Decimal;

/** Compute the best single-venue quote (highest receive). */
export function pickBestSingle(
  quotes: readonly Quote[],
): { venueId: string; receive: string } | null {
  let best: { venueId: string; receive: Decimal } | null = null;
  for (const q of quotes) {
    const receive = Decimal.parse(q.receive.amount);
    if (receive === undefined) continue;
    if (best === null || receive.gt(best.receive)) {
      best = { venueId: q.venueId, receive };
    }
  }
  return best === null
    ? null
    : { venueId: best.venueId, receive: best.receive.toString() };
}

/** Edge in bps of `routed` over `best` (0 if equal; null if not computable). */
export function edgeBps(
  routed: string | null,
  best: string | null,
): number | null {
  if (routed === null || best === null) return null;
  const r = Decimal.parse(routed);
  const b = Decimal.parse(best);
  if (r === undefined || b === undefined || !b.isPositive()) return null;
  return Number(r.sub(b).mul(TEN_K).divide(b, 2, 'floor').toString());
}

export async function aggregateQuotes(
  adapters: readonly VenueAdapter[],
  intent: SwapIntent,
  now: Date,
): Promise<AggregateResult> {
  const outcomes = await Promise.all(
    adapters.map((a) => quoteVenue(a, intent)),
  );
  const quotes = outcomes
    .map((o) => o.quote)
    .filter((q): q is Quote => q !== null);

  const routed = route(intent, quotes, now);
  const bestSingle = pickBestSingle(quotes);
  const routedReceive = routed.ok ? routed.plan.aggregateReceive : null;

  return {
    intent,
    outcomes,
    quotes,
    route: routed,
    bestSingle,
    edgeBps: edgeBps(routedReceive, bestSingle?.receive ?? null),
  };
}
