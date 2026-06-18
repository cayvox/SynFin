/**
 * Demo 2 — atomic, per-leg-private split SETTLEMENT (ADR-0008; RFC-0003;
 * SPEC §6, §7). The CLI does **not** contain settlement logic: it drives the
 * existing, proven `daml/synfin-settlement` library via the demo Daml Script
 * (`Synfin.Demo.AtomicSettlement:demoAtomicSettlement`) on a **local in-memory
 * ledger** and narrates the result.
 *
 * This module holds the pure parts (orchestration + narrated formatting) so they
 * are unit-testable with an injected {@link DemoRunner}; the impure default
 * runner that spawns the Daml toolchain lives in `main.ts`.
 */

/** The result of attempting to run the demo Daml Script. */
export interface DemoRunResult {
  /** Whether the Daml toolchain (`daml`) was found and runnable. */
  readonly available: boolean;
  /** Process exit code (`null` if it never ran, e.g. toolchain absent). */
  readonly exitCode: number | null;
  /** Captured combined output of the Daml run (for diagnostics). */
  readonly output: string;
}

/** Injectable runner: executes the demo Daml Script and reports the outcome. */
export type DemoRunner = () => Promise<DemoRunResult>;

export interface SettleDemoOutcome {
  readonly report: string;
  readonly ok: boolean;
}

const HONESTY: readonly string[] = [
  'Synfin — Demo 2: atomic, per-leg-private split SETTLEMENT',
  '',
  'Honest framing (ADR-0009): this runs against our OWN CIP-0056 test venue',
  '(Amulet) on a LOCAL in-memory ledger / sandbox — no funds, no mainnet, no',
  'third-party venue. It demonstrates the settlement architecture that is ready',
  'for Mode-A (CIP-0056-allocation) venues as the network matures. It is NOT a',
  'claim of atomic settlement against live third-party venues: ADR-0009 confirmed',
  "today's accessible venues are Mode B (managed-deposit / quote-only).",
  '',
  'It reuses the daml/synfin-settlement library UNCHANGED (proven by the Task-003.6',
  'Daml Script matrix, incl. testPerLegVisibility); the CLI only orchestrates it.',
];

/** What a successful run has demonstrated (mirrors the demo script's assertions). */
const PROVEN: readonly string[] = [
  'Route: taker gives 100 Amulet (60 -> venue A, 40 -> venue B) and receives 120',
  '       back (70 from A, 50 from B) — a 2-venue, 4-leg split.',
  '',
  '  [PASS] Atomic: all 4 legs settled in ONE Daml transaction (all-or-nothing).',
  '  [PASS] On-ledger bounds enforced: conservation, minReceive, slippage, deadline.',
  '  [PASS] Single-use allocations: none remain after settlement (no double-spend).',
  "  [PASS] Per-leg privacy: venue A did NOT see venue B's leg (and vice-versa);",
  '         the taker + executor saw the aggregate route (SPEC §7).',
];

const PREREQUISITE: readonly string[] = [
  'Prerequisite not met: the Daml SDK toolchain (`daml`) was not found.',
  '',
  'Demo 2 runs a real Daml Script on a local in-memory ledger, so it needs the',
  'Daml SDK + JDK on PATH (the same setup the `daml build && daml test` gate uses;',
  'see daml/dars/README.md and the CI Daml job). Install it, then re-run',
  '`synfin settle-demo`. (No result is fabricated when the toolchain is absent.)',
];

/** Render the narrated, honestly-labelled Demo 2 report. Pure. */
export function formatSettleDemoReport(result: DemoRunResult): string {
  const lines: string[] = [...HONESTY, '', '─'.repeat(62)];

  if (!result.available) {
    lines.push('', ...PREREQUISITE);
    return lines.join('\n');
  }

  if (result.exitCode === 0) {
    lines.push(
      '',
      ...PROVEN,
      '',
      'DEMO 2 RESULT: PASS — verified on a local CIP-0056 (Amulet) ledger.',
    );
    return lines.join('\n');
  }

  lines.push(
    '',
    `DEMO 2 RESULT: FAILED (daml exit code ${String(result.exitCode)}).`,
    'The settlement demo did not pass — see the Daml output below. No result is',
    'fabricated.',
    '',
    '── Daml output ────────────────────────────────────────────────',
    result.output.trim() === '' ? '(no output captured)' : result.output.trim(),
  );
  return lines.join('\n');
}

/** Run the demo via the injected runner and format the outcome. */
export async function runSettleDemo(
  runner: DemoRunner,
): Promise<SettleDemoOutcome> {
  const result = await runner();
  return {
    report: formatSettleDemoReport(result),
    ok: result.available && result.exitCode === 0,
  };
}
