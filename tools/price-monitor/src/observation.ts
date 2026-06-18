/**
 * A single price observation and the append-only JSONL store.
 *
 * An observation is one venue's answer to one (pair, size) quote request at a
 * point in time — recorded read-only (no funds, no settlement). The store is a
 * dependency-light append-only JSON-Lines file: one observation per line.
 */

/** Whether an observation came from a live venue call or a recorded fixture. */
export type Provenance = 'live' | 'fixture';

/** One recorded observation (untrusted venue data, already normalized). */
export interface Observation {
  /** ISO-8601 capture time. */
  readonly timestamp: string;
  /** `live` vs `fixture` — every row is labelled so the dataset is honest. */
  readonly source: Provenance;
  readonly venueId: string;
  /** Display pair, e.g. `CC/USDCx`. */
  readonly pair: string;
  /** The give (input) instrument symbol. */
  readonly giveSymbol: string;
  /** The want (output) instrument symbol. */
  readonly wantSymbol: string;
  /** The give size for this request (decimal string). */
  readonly size: string;
  /** Normalized receive (want units, decimal string), or `null` if not quoted. */
  readonly receive: string | null;
  /** Average rate receive/size (decimal string), or `null` if not quoted. */
  readonly rate: string | null;
  /** Fee in bps as declared by the adapter, or `null` if not quoted. */
  readonly feeBps: number | null;
  /** Typed rejection code if the venue did not quote, else `null`. */
  readonly rejectionCode: string | null;
}

/** Serialize observations to JSONL text (one compact JSON object per line). */
export function toJsonl(observations: readonly Observation[]): string {
  return observations.map((o) => JSON.stringify(o)).join('\n');
}

/**
 * Parse JSONL text into observations, skipping blank lines. Treats the file as
 * untrusted: a malformed/empty line is skipped rather than throwing, and only
 * objects carrying the required string fields are accepted.
 */
export function parseJsonl(text: string): Observation[] {
  const out: Observation[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    let value: unknown;
    try {
      value = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (isObservation(value)) out.push(value);
  }
  return out;
}

function isObservation(v: unknown): v is Observation {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o['timestamp'] === 'string' &&
    (o['source'] === 'live' || o['source'] === 'fixture') &&
    typeof o['venueId'] === 'string' &&
    typeof o['pair'] === 'string' &&
    typeof o['size'] === 'string'
  );
}
