#!/usr/bin/env node
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CantonSwapAdapter,
  OneSwapAdapter,
  fetchJson,
  type Fetcher,
} from '@synfin/adapters';
import type { VenueAdapter } from '@synfin/spec';
import { createRequire } from 'node:module';
import { collectObservations } from './collect.js';
import {
  parseJsonl,
  toJsonl,
  type Observation,
  type Provenance,
} from './observation.js';
import { toCsv, toMarkdown } from './report.js';
import { computeSpread } from './spread.js';
import { defaultPairSpecs } from './tokens.js';

/**
 * Bin entry for the Phase-0 price monitor. Thin I/O shell: build read-only
 * adapters, collect one sampling round, append observations to an append-only
 * JSONL store, and (re)write the spread report. Read-only and fundless. Excluded
 * from coverage (the logic it calls is unit-tested); run live manually / on a
 * schedule (cron, `watch`, or `--rounds`/`--interval`).
 */

const USAGE = `Synfin price monitor — Phase-0 cross-venue price-divergence (read-only, no funds)

Usage:
  synfin-price-monitor collect [--rounds N] [--interval SECONDS] [--fixtures]
  synfin-price-monitor report

  collect   sample quotes (CC/USDCx at several sizes) from CantonSwap + OneSwap,
            append to data/observations.jsonl, then write the spread report.
  report    recompute data/report.md + data/report.csv from the recorded store.

Flags:
  --rounds N        number of sampling rounds (default 1)
  --interval S      seconds between rounds (default 0)
  --fixtures        use recorded golden fixtures instead of live calls (offline)

OneSwap live quoting needs ONESWAP_API_KEY (+ ONESWAP_BASE_URL); without them
that venue is skipped. CantonSwap needs no key. Live runs are labelled 'live';
fixture runs are labelled 'fixture' in every row and in the report header.`;

const DATA_DIR = (() => {
  const here = dirname(fileURLToPath(import.meta.url)); // .../dist
  return resolve(here, '..', 'data');
})();
const STORE = join(DATA_DIR, 'observations.jsonl');

function fixturePath(rel: string): string {
  return createRequire(import.meta.url).resolve(
    `@synfin/adapters/fixtures/${rel}`,
  );
}
function fixtureFetcher(rel: string): Fetcher {
  const body: unknown = JSON.parse(readFileSync(fixturePath(rel), 'utf8'));
  return () => Promise.resolve({ status: 200, body });
}

function liveAdapters(): VenueAdapter[] {
  const apiKey = process.env['ONESWAP_API_KEY'];
  const baseUrl = process.env['ONESWAP_BASE_URL'];
  return [
    new CantonSwapAdapter({ fetcher: fetchJson() }),
    new OneSwapAdapter({
      fetcher: fetchJson(),
      ...(apiKey !== undefined ? { apiKey } : {}),
      ...(baseUrl !== undefined ? { baseUrl } : {}),
    }),
  ];
}
function fixtureAdapters(): VenueAdapter[] {
  return [
    new CantonSwapAdapter({
      fetcher: fixtureFetcher('cantonswap/quote-amulet-usdcx-125.json'),
    }),
    new OneSwapAdapter({
      baseUrl: 'fixture',
      apiKey: 'fixture',
      fetcher: fixtureFetcher('oneswap/quote-amulet-usdcx-100.json'),
    }),
  ];
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function loadStore(): Observation[] {
  try {
    return parseJsonl(readFileSync(STORE, 'utf8'));
  } catch {
    return [];
  }
}

function writeReports(
  observations: readonly Observation[],
  source: Provenance,
): void {
  const rows = computeSpread(observations);
  const meta = { source, totalObservations: observations.length };
  writeFileSync(join(DATA_DIR, 'report.md'), toMarkdown(rows, meta) + '\n');
  writeFileSync(join(DATA_DIR, 'report.csv'), toCsv(rows) + '\n');
}

async function collect(
  rounds: number,
  intervalS: number,
  useFixtures: boolean,
): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true });
  const adapters = useFixtures ? fixtureAdapters() : liveAdapters();
  const source: Provenance = useFixtures ? 'fixture' : 'live';
  const specs = defaultPairSpecs();

  for (let round = 0; round < rounds; round++) {
    const observations = await collectObservations(
      adapters,
      specs,
      new Date(),
      source,
    );
    appendFileSync(STORE, toJsonl(observations) + '\n');
    const quoted = observations.filter((o) => o.receive !== null).length;
    console.log(
      `[${source}] round ${round + 1}/${rounds}: recorded ${observations.length} observations (${quoted} quoted) -> ${STORE}`,
    );
    if (round + 1 < rounds && intervalS > 0) await sleep(intervalS * 1000);
  }

  const all = loadStore();
  writeReports(all, source);
  console.log(
    toMarkdown(computeSpread(all), { source, totalObservations: all.length }),
  );
}

function report(): void {
  const all = loadStore();
  if (all.length === 0) {
    console.error(
      `No observations at ${STORE}. Run \`synfin-price-monitor collect\` first.`,
    );
    process.exit(1);
  }
  // The store may mix sources; label the report 'live' only if every row is live.
  const source: Provenance = all.every((o) => o.source === 'live')
    ? 'live'
    : 'fixture';
  writeReports(all, source);
  console.log(
    toMarkdown(computeSpread(all), { source, totalObservations: all.length }),
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0];
  if (command === 'report') {
    report();
    return;
  }
  if (command === 'collect') {
    const rounds = flagNumber(argv, '--rounds', 1);
    const interval = flagNumber(argv, '--interval', 0);
    const useFixtures = argv.includes('--fixtures');
    await collect(rounds, interval, useFixtures);
    return;
  }
  console.log(USAGE);
  process.exit(argv.length === 0 ? 0 : 1);
}

function flagNumber(
  argv: readonly string[],
  flag: string,
  fallback: number,
): number {
  const i = argv.indexOf(flag);
  if (i === -1) return fallback;
  const v = argv[i + 1];
  if (v === undefined || !/^\d+$/.test(v)) return fallback;
  return Number(v);
}

void main();
