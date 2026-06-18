import type { SpreadRow } from './spread.js';
import type { Provenance } from './observation.js';

/**
 * Minimal cross-venue spread reports (Markdown + CSV) from {@link SpreadRow}s.
 * Pure: no I/O, no clock. The `source` banner makes it unmistakable whether the
 * underlying observations were live or recorded fixtures.
 */

export interface ReportMeta {
  /** Whether the observations were live or fixtures (labelled in the report). */
  readonly source: Provenance;
  /** Total observations the rows were computed from. */
  readonly totalObservations: number;
}

const fmtBps = (bps: number | null): string =>
  bps === null ? 'n/a' : `${bps}`;

/** A human-readable Markdown report. */
export function toMarkdown(
  rows: readonly SpreadRow[],
  meta: ReportMeta,
): string {
  const lines: string[] = [];
  lines.push('# Synfin — cross-venue price-divergence (Phase 0)');
  lines.push('');
  lines.push(
    meta.source === 'live'
      ? '_Source: LIVE venue quotes (read-only; no funds, no settlement)._'
      : '_Source: RECORDED FIXTURE data (NOT live) — sample dataset._',
  );
  lines.push('');
  lines.push(
    `Observations: ${meta.totalObservations}. Pairs/sizes: ${rows.length}.`,
  );
  lines.push('');
  lines.push(
    '| Pair | Size | Quoted venues | Best (venue) | Worst (venue) | Spread (bps) | Obs | Window |',
  );
  lines.push('| --- | --- | ---: | --- | --- | ---: | ---: | --- |');
  for (const r of rows) {
    const best =
      r.bestReceive === null ? '—' : `${r.bestReceive} (${r.bestVenue ?? '—'})`;
    const worst =
      r.worstReceive === null
        ? '—'
        : `${r.worstReceive} (${r.worstVenue ?? '—'})`;
    const window =
      r.firstSeen === null
        ? '—'
        : r.firstSeen === r.lastSeen
          ? r.firstSeen
          : `${r.firstSeen} … ${r.lastSeen}`;
    lines.push(
      `| ${r.pair} | ${r.size} | ${r.quotedVenues} | ${best} | ${worst} | ${fmtBps(r.spreadBps)} | ${r.observations} | ${window} |`,
    );
  }
  lines.push('');
  const measured = rows.filter((r) => r.spreadBps !== null);
  if (measured.length > 0) {
    const max = measured.reduce((m, r) => Math.max(m, r.spreadBps ?? 0), 0);
    lines.push(`Max cross-venue spread observed: **${max} bps**.`);
  } else {
    lines.push(
      'No (pair, size) had ≥ 2 venues quoting, so no spread could be measured yet.',
    );
  }
  return lines.join('\n');
}

/** A CSV report (one row per pair/size). */
export function toCsv(rows: readonly SpreadRow[]): string {
  const header =
    'pair,size,quotedVenues,bestVenue,bestReceive,worstVenue,worstReceive,spreadBps,observations,firstSeen,lastSeen';
  const body = rows.map((r) =>
    [
      r.pair,
      r.size,
      r.quotedVenues,
      r.bestVenue ?? '',
      r.bestReceive ?? '',
      r.worstVenue ?? '',
      r.worstReceive ?? '',
      r.spreadBps ?? '',
      r.observations,
      r.firstSeen ?? '',
      r.lastSeen ?? '',
    ].join(','),
  );
  return [header, ...body].join('\n');
}
