import type { AggregateResult } from './aggregate.js';

/** Whether the report came from live venue calls or recorded fixtures. */
export type RunMode = 'live' | 'fixtures';

/** Provenance date of the committed fixtures (see packages/cli/fixtures). */
const FIXTURE_DATE = '2026-06-18';

/**
 * Render an {@link AggregateResult} as a clean, demo-worthy text report. Pure:
 * no I/O, no clock. The `mode` banner makes it unmistakable whether the numbers
 * are live or recorded sample data.
 */
export function formatReport(result: AggregateResult, mode: RunMode): string {
  const { intent } = result;
  const give = `${intent.give.amount} ${intent.give.asset.instrumentId}`;
  const want = intent.want.asset.instrumentId;
  const lines: string[] = [];

  lines.push('Synfin — cross-venue quote aggregation (Demo 1)');
  lines.push(
    mode === 'live'
      ? 'Source: LIVE venue quotes (read-only; no funds, no settlement)'
      : `Source: RECORDED SAMPLE DATA — fixtures dated ${FIXTURE_DATE} (NOT live)`,
  );
  lines.push('');
  lines.push(
    `Intent: swap ${give} -> ${want}  (max slippage ${intent.maxSlippageBps} bps)`,
  );
  lines.push('');
  lines.push('Venue quotes:');
  for (const o of result.outcomes) {
    const tag = `[${o.settlementMode}]`;
    if (o.quote) {
      lines.push(
        `  - ${o.venueId} ${tag}: ${o.quote.receive.amount} ${want}` +
          `  (${o.quote.firmness}, valid until ${o.quote.validUntil})`,
      );
    } else {
      const code = o.rejection?.code ?? 'no_quote';
      lines.push(`  - ${o.venueId} ${tag}: no quote (${code})`);
    }
  }
  lines.push('');

  if (result.route.ok) {
    const plan = result.route.plan;
    const legs = plan.legs
      .map((l) => `${l.venueId} (${l.receive.amount} ${want})`)
      .join(' + ');
    lines.push(`Best route: ${legs}`);
    lines.push(`  Aggregate receive: ${plan.aggregateReceive} ${want}`);
    lines.push(`  Worst-case receive: ${plan.worstCaseReceive} ${want}`);
    if (result.bestSingle) {
      lines.push(
        `  Best single venue: ${result.bestSingle.venueId} (${result.bestSingle.receive} ${want})`,
      );
    }
    lines.push(
      result.edgeBps === null
        ? '  Edge vs best single venue: n/a'
        : `  Edge vs best single venue: ${result.edgeBps} bps`,
    );
  } else {
    lines.push(`Best route: none (${result.route.reason})`);
  }

  lines.push('');
  lines.push(
    'Note: CantonSwap, OneSwap, and Tradecraft are managed-deposit (Mode B) venues, quote layer only.',
  );
  lines.push(
    'No deposit, settlement, or funds movement is performed by this command.',
  );
  return lines.join('\n');
}
