import {
  Decimal,
  isQuoteRejection,
  type QuoteRequest,
  type VenueAdapter,
} from '@synfin/spec';
import type { Observation, Provenance } from './observation.js';
import type { PairSpec } from './tokens.js';

/**
 * Read-only collection: ask each venue adapter for a quote on each (pair, size)
 * and normalize the answer into an {@link Observation}. Pure with respect to the
 * injected adapters and clock — the same adapters + time produce the same
 * observations — so it is unit-testable against golden fixtures with no network.
 *
 * It only calls `adapter.quote()` (no funds, no settlement). A transport failure
 * on one venue becomes a typed observation (`rejectionCode: 'transport_error'`),
 * never aborting the run.
 */

function quoteRequest(
  spec: PairSpec,
  venueId: string,
  at: string,
): QuoteRequest {
  return {
    intentRef: `price-monitor:${at}`,
    give: { asset: spec.give, amount: spec.size },
    want: { asset: spec.want },
    deadline: '2999-01-01T00:00:00Z',
    nonce: `pm:${venueId}:${spec.giveSymbol}-${spec.wantSymbol}:${spec.size}:${at}`,
  };
}

/** receive/size as a decimal string, or `null` if not computable. */
function rateOf(size: string, receive: string): string | null {
  const s = Decimal.parse(size);
  const r = Decimal.parse(receive);
  if (s === undefined || r === undefined || !s.isPositive()) return null;
  return r.divide(s, 12, 'floor').toString();
}

async function observeVenue(
  adapter: VenueAdapter,
  spec: PairSpec,
  timestamp: string,
  source: Provenance,
): Promise<Observation> {
  const base = {
    timestamp,
    source,
    venueId: adapter.venueId,
    pair: `${spec.giveSymbol}/${spec.wantSymbol}`,
    giveSymbol: spec.giveSymbol,
    wantSymbol: spec.wantSymbol,
    size: spec.size,
  };
  try {
    const result = await adapter.quote(
      quoteRequest(spec, adapter.venueId, timestamp),
    );
    if (isQuoteRejection(result)) {
      return {
        ...base,
        receive: null,
        rate: null,
        feeBps: null,
        rejectionCode: result.code,
      };
    }
    return {
      ...base,
      receive: result.receive.amount,
      rate: rateOf(spec.size, result.receive.amount),
      feeBps: result.feeBps,
      rejectionCode: null,
    };
  } catch {
    // Transport/timeout failure: record it as a typed observation, never throw.
    return {
      ...base,
      receive: null,
      rate: null,
      feeBps: null,
      rejectionCode: 'transport_error',
    };
  }
}

/**
 * Collect one observation per (adapter × pair-spec) at `now`. The `timestamp` is
 * taken once from `now` so all observations in a sampling round share it.
 */
export async function collectObservations(
  adapters: readonly VenueAdapter[],
  specs: readonly PairSpec[],
  now: Date,
  source: Provenance,
): Promise<Observation[]> {
  const timestamp = now.toISOString();
  const tasks: Array<Promise<Observation>> = [];
  for (const spec of specs) {
    for (const adapter of adapters) {
      tasks.push(observeVenue(adapter, spec, timestamp, source));
    }
  }
  return Promise.all(tasks);
}
