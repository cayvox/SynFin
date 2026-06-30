import { route } from '@synfin/router-ref';
import {
  Decimal,
  computeWorstCaseReceiveNet,
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
  /** The quote's NET receipt (gross minus any network fee, RFC-0005); null when no quote. */
  readonly netReceive: string | null;
}

export interface AggregateResult {
  readonly intent: SwapIntent;
  readonly outcomes: readonly VenueOutcome[];
  readonly quotes: readonly Quote[];
  readonly route: RouteResult;
  /** Best single-venue quote by NET receipt (null if none quoted). */
  readonly bestSingle: {
    readonly venueId: string;
    readonly receive: string;
    readonly net: string;
  } | null;
  /** Routed NET improvement over the best single venue's net, in bps (null if none). */
  readonly edgeBps: number | null;
}

/**
 * A quote's NET receipt, computed the SAME way the router ranks (RFC-0005 §3):
 * parse the gross receive, the intent give, and any network fee to Decimal, then
 * call {@link computeWorstCaseReceiveNet}. Mirrors router-ref so the report and
 * the route agree. Falls back to the gross string when amounts do not parse or
 * the helper cannot value the fee (a conformant adapter never emits an
 * unsupported-asset fee, so the fallback is defensive only).
 */
function quoteNetReceive(quote: Quote, intent: SwapIntent): string {
  const gross = Decimal.parse(quote.receive.amount);
  const give = Decimal.parse(intent.give.amount);
  if (gross === undefined || give === undefined) return quote.receive.amount;
  const fee = quote.networkFee;
  const feeAmount = fee !== undefined ? Decimal.parse(fee.amount) : undefined;
  if (fee !== undefined && feeAmount === undefined) return quote.receive.amount;
  const net = computeWorstCaseReceiveNet(
    gross,
    { asset: intent.give.asset, amount: give },
    intent.want.asset,
    fee !== undefined && feeAmount !== undefined
      ? {
          asset: fee.asset,
          amount: feeAmount,
          // Forward the fee direction so the helper branches on it (RFC-0006 §3):
          // an on_top fee re-bases, a deducted_from_give fee is already net (the
          // net equals the gross). Absent stays absent (read as on_top).
          ...(fee.appliedTo !== undefined ? { appliedTo: fee.appliedTo } : {}),
        }
      : undefined,
  );
  return net.ok ? net.value.toString() : quote.receive.amount;
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
      ? { ...base, quote: null, rejection: result, netReceive: null }
      : {
          ...base,
          quote: result,
          rejection: null,
          netReceive: quoteNetReceive(result, intent),
        };
  } catch (err) {
    // Transport/timeout failure: surface as a typed outcome, never throw.
    const message = err instanceof Error ? err.message : 'transport error';
    return {
      ...base,
      quote: null,
      rejection: { venueId: adapter.venueId, code: 'transport_error', message },
      netReceive: null,
    };
  }
}

const TEN_K = Decimal.parse('10000') as Decimal;

/** Compute the best single-venue quote by NET receipt (RFC-0005), with its gross. */
export function pickBestSingle(
  quotes: readonly Quote[],
  intent: SwapIntent,
): { venueId: string; receive: string; net: string } | null {
  let best: {
    venueId: string;
    receive: string;
    net: string;
    netDec: Decimal;
  } | null = null;
  for (const q of quotes) {
    const gross = Decimal.parse(q.receive.amount);
    if (gross === undefined) continue;
    const net = quoteNetReceive(q, intent);
    const netDec = Decimal.parse(net);
    if (netDec === undefined) continue;
    if (best === null || netDec.gt(best.netDec)) {
      best = { venueId: q.venueId, receive: gross.toString(), net, netDec };
    }
  }
  return best === null
    ? null
    : { venueId: best.venueId, receive: best.receive, net: best.net };
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
  const bestSingle = pickBestSingle(quotes, intent);
  // Edge is computed on NET (RFC-0005 §3): the routed plan's net (its
  // worstCaseReceiveNet, or the gross worstCaseReceive when fee-free) over the
  // best single venue's net.
  const routedNet = routed.ok
    ? (routed.plan.worstCaseReceiveNet ?? routed.plan.worstCaseReceive)
    : null;

  return {
    intent,
    outcomes,
    quotes,
    route: routed,
    bestSingle,
    edgeBps: edgeBps(routedNet, bestSingle?.net ?? null),
  };
}
