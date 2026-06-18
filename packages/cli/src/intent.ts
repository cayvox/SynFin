import type { AssetId, SwapIntent } from '@synfin/spec';

/** The minimal positive amount at an instrument's precision (e.g. 6 → "0.000001"). */
export function minUnit(decimals: number): string {
  if (decimals <= 0) return '1';
  return `0.${'0'.repeat(decimals - 1)}1`;
}

export interface BuildIntentParams {
  readonly give: AssetId;
  readonly want: AssetId;
  readonly amount: string;
  readonly slippageBps: number;
  readonly deadline: string;
  readonly intentId?: string;
  readonly taker?: string;
}

/**
 * Build a {@link SwapIntent} for the CLI from a pair + size. `minReceive` is set
 * to the smallest positive unit of the want instrument (a permissive floor) so
 * the demo surfaces whatever the venues quote; `maxSlippageBps` carries the
 * caller's bound. Pure.
 */
export function buildIntent(params: BuildIntentParams): SwapIntent {
  return {
    intentId: params.intentId ?? 'cli-demo-intent',
    taker: params.taker ?? 'cli-demo-taker',
    give: { asset: params.give, amount: params.amount },
    want: { asset: params.want, minReceive: minUnit(params.want.decimals) },
    maxSlippageBps: params.slippageBps,
    deadline: params.deadline,
  };
}
