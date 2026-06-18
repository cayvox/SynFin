#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  CantonSwapAdapter,
  OneSwapAdapter,
  fetchJson,
  type Fetcher,
} from '@synfin/adapters';
import type { VenueAdapter } from '@synfin/spec';
import { aggregateQuotes, type AggregateResult } from './aggregate.js';
import { formatReport } from './format.js';
import { buildIntent } from './intent.js';
import { resolveToken } from './tokens.js';

/**
 * Bin entry for `synfin quote` (Demo 1). Thin I/O shell: parse argv, build live
 * read-only adapters, aggregate, and print. On any failure to obtain live
 * quotes (unreachable / unconfigured / rate-limited), it falls back to the
 * committed golden fixtures and clearly labels the output as recorded sample
 * data. Read-only and fundless — it never deposits or settles. Excluded from
 * coverage (the logic it calls is unit-tested); exercised via the manual demo.
 */

const USAGE = `Synfin CLI — Demo 1: cross-venue quote aggregation (read-only, no funds)

Usage:
  synfin quote <FROM> <TO> <AMOUNT> [--slippage-bps N] [--fixtures]

Examples:
  synfin quote CC USDCx 125
  synfin quote CC USDCx 125 --slippage-bps 50

Tokens: CC, USDCx, CBTC. CantonSwap needs no key. OneSwap quoting needs
ONESWAP_API_KEY (and ONESWAP_BASE_URL); without them that venue is skipped and
the command falls back to recorded fixtures.`;

interface Args {
  from: string;
  to: string;
  amount: string;
  slippageBps: number;
  forceFixtures: boolean;
}

function parseArgs(argv: readonly string[]): Args | null {
  if (argv[0] !== 'quote') return null;
  const positional: string[] = [];
  let slippageBps = 50;
  let forceFixtures = false;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fixtures') forceFixtures = true;
    else if (a === '--slippage-bps') {
      const v = argv[++i];
      if (v === undefined || !/^\d+$/.test(v)) return null;
      slippageBps = Number(v);
    } else if (a !== undefined) positional.push(a);
  }
  const [from, to, amount] = positional;
  if (from === undefined || to === undefined || amount === undefined)
    return null;
  return { from, to, amount, slippageBps, forceFixtures };
}

/** Resolve a committed golden fixture exposed by @synfin/adapters. */
function fixturePath(rel: string): string {
  return createRequire(import.meta.url).resolve(
    `@synfin/adapters/fixtures/${rel}`,
  );
}

function fixtureFetcher(rel: string): Fetcher {
  const body: unknown = JSON.parse(readFileSync(fixturePath(rel), 'utf8'));
  return () => Promise.resolve({ status: 200, body });
}

function liveAdapters(slippageBps: number): VenueAdapter[] {
  const adapters: VenueAdapter[] = [
    new CantonSwapAdapter({
      fetcher: fetchJson(),
      slippageTolerance: slippageBps / 10000,
    }),
  ];
  const apiKey = process.env['ONESWAP_API_KEY'];
  const baseUrl = process.env['ONESWAP_BASE_URL'];
  adapters.push(
    new OneSwapAdapter({
      fetcher: fetchJson(),
      ...(apiKey !== undefined ? { apiKey } : {}),
      ...(baseUrl !== undefined ? { baseUrl } : {}),
    }),
  );
  return adapters;
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    console.log(USAGE);
    process.exit(process.argv.length <= 2 ? 0 : 1);
  }
  const give = resolveToken(args.from);
  const want = resolveToken(args.to);
  if (give === undefined || want === undefined) {
    console.error(`Unknown token symbol. Known: CC, USDCx, CBTC.`);
    process.exit(1);
  }

  const now = new Date();
  const deadline = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const intent = buildIntent({
    give,
    want,
    amount: args.amount,
    slippageBps: args.slippageBps,
    deadline,
  });

  // Attempt live, read-only quotes first (unless fixtures are forced).
  if (!args.forceFixtures) {
    const live = await aggregateQuotes(
      liveAdapters(args.slippageBps),
      intent,
      now,
    );
    if (live.quotes.length > 0) {
      console.log(formatReport(live, 'live'));
      return;
    }
  }

  // Fall back to the committed golden fixtures (clearly labelled).
  let fixtureResult: AggregateResult;
  try {
    fixtureResult = await aggregateQuotes(fixtureAdapters(), intent, now);
  } catch (err) {
    console.error(
      `Live quotes unavailable and fixture fallback failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    process.exit(1);
  }
  console.log(formatReport(fixtureResult, 'fixtures'));
}

void main();
