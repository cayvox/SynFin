#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CantexAdapter,
  CantonSwapAdapter,
  OneSwapAdapter,
  TradecraftAdapter,
  fetchJson,
  type Fetcher,
} from '@synfin/adapters';
import type { VenueAdapter } from '@synfin/spec';
import { aggregateQuotes, type AggregateResult } from './aggregate.js';
import { formatReport } from './format.js';
import { buildIntent } from './intent.js';
import { resolveToken } from './tokens.js';
import { runSettleDemo, type DemoRunResult } from './settle-demo.js';

/**
 * Bin entry for the Synfin CLI. Thin I/O shell that orchestrates the two PoW
 * demos and prints narrated, honestly-labelled output:
 *
 *   - `quote`        Demo 1 — cross-venue quote aggregation across REAL venues
 *                    (CantonSwap, OneSwap). Read-only, no funds. Live + golden
 *                    fallback.
 *   - `settle-demo`  Demo 2 — atomic, per-leg-private split SETTLEMENT against
 *                    our OWN CIP-0056 test venue (Amulet) on a local ledger.
 *                    Drives the proven daml/synfin-settlement library; no funds,
 *                    no mainnet.
 *
 * Excluded from coverage (the logic it calls is unit-tested); exercised via the
 * documented manual demo runs and the Daml gate.
 */

const USAGE = `Synfin CLI — a unified quote layer across Canton venues, with atomic settlement.

Two-demo proof of work:
  • Demo 1 (quote)       unified quote aggregation across REAL venues — works today.
  • Demo 2 (settle-demo) atomic, per-leg-private split settlement against our own
                         CIP-0056 test venue (Amulet) — architecture proven; awaits
                         Mode-A venues (ADR-0009).

Usage:
  synfin quote <FROM> <TO> <AMOUNT> [--slippage-bps N] [--fixtures]
  synfin settle-demo

Examples:
  synfin quote CC USDCx 125
  synfin quote CC USDCx 125 --slippage-bps 50
  synfin settle-demo

Tokens: CC, USDCx, CBTC. CantonSwap, Tradecraft, and Cantex need no key. OneSwap
quoting needs ONESWAP_API_KEY (and ONESWAP_BASE_URL); without them that venue is
skipped and the command falls back to recorded fixtures. \`settle-demo\` needs the
Daml SDK toolchain (local in-memory ledger; no funds, no mainnet).`;

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

/** Resolve a demo fixture bundled inside this package (packages/cli/fixtures). */
function fixturePath(rel: string): string {
  return fileURLToPath(new URL(`../fixtures/${rel}`, import.meta.url));
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
  // Tradecraft needs no key and defaults its base URL (https://api.tradecraft.fi/v1).
  adapters.push(new TradecraftAdapter({ fetcher: fetchJson() }));
  // Cantex needs no key; the public quote path defaults to api.cantex.io/v1/public.
  adapters.push(new CantexAdapter({ fetcher: fetchJson() }));
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
    new TradecraftAdapter({
      fetcher: fixtureFetcher('tradecraft/quote-cc-usdcx-100.json'),
    }),
    new CantexAdapter({
      fetcher: fixtureFetcher('cantex/quote-cc-usdcx-100.json'),
    }),
  ];
}

async function runQuoteCommand(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  if (args === null) {
    console.log(USAGE);
    process.exit(1);
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

/**
 * Default Demo 2 runner: drives the proven settlement library via its demo Daml
 * Script on a local in-memory ledger. It builds the library DAR, then runs the
 * demo script with `daml test`. If the Daml toolchain is absent it reports
 * `available: false` (the CLI then fails gracefully — no fabricated result).
 */
function defaultDemoRunner(): Promise<DemoRunResult> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const lib = join(repoRoot, 'daml', 'synfin-settlement');
  const test = join(repoRoot, 'daml', 'synfin-settlement-test');
  const opts = { encoding: 'utf8' as const, maxBuffer: 32 * 1024 * 1024 };

  const probe = spawnSync('daml', ['version'], opts);
  if (probe.error && (probe.error as NodeJS.ErrnoException).code === 'ENOENT') {
    return Promise.resolve({ available: false, exitCode: null, output: '' });
  }

  const build = spawnSync('daml', ['build'], { cwd: lib, ...opts });
  const run = spawnSync(
    'daml',
    [
      'test',
      '--files',
      join('daml', 'Synfin', 'Demo', 'AtomicSettlement.daml'),
    ],
    { cwd: test, ...opts },
  );
  const output = [build.stdout, build.stderr, run.stdout, run.stderr]
    .filter((s): s is string => Boolean(s))
    .join('\n');
  const exitCode = build.status !== 0 ? build.status : run.status;
  return Promise.resolve({ available: true, exitCode, output });
}

async function runSettleDemoCommand(): Promise<void> {
  const { report, ok } = await runSettleDemo(defaultDemoRunner);
  console.log(report);
  if (!ok) process.exit(1);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0];
  if (command === 'settle-demo') {
    await runSettleDemoCommand();
    return;
  }
  if (command === 'quote') {
    await runQuoteCommand(argv);
    return;
  }
  console.log(USAGE);
  process.exit(argv.length === 0 ? 0 : 1);
}

void main();
