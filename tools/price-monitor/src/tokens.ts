import type { AssetId } from '@synfin/spec';

/**
 * Tokens the monitor can request, by symbol. Mirrors CantonSwap's live
 * `GET /nswap/tokens` catalog (decimals/admin); `instrumentId` is what the venue
 * adapters expect (both use `Amulet` for CC). Demo convenience map, not a registry.
 */
export const TOKENS: Readonly<Record<string, AssetId>> = {
  CC: {
    registry:
      'DSO::1220sample0000000000000000000000000000000000000000000000000000000000',
    instrumentId: 'Amulet',
    decimals: 10,
  },
  USDCx: {
    registry:
      'decentralized-usdc-interchain-rep::1220sample00000000000000000000000000000000000000000000000000000000',
    instrumentId: 'USDCx',
    decimals: 6,
  },
  CBTC: {
    registry:
      'cbtc-network::1220sample000000000000000000000000000000000000000000000000000000',
    instrumentId: 'CBTC',
    decimals: 8,
  },
};

/** One (pair, size) the monitor samples. */
export interface PairSpec {
  readonly giveSymbol: string;
  readonly wantSymbol: string;
  readonly give: AssetId;
  readonly want: AssetId;
  readonly size: string;
}

/** Build a {@link PairSpec} from symbols + a size; `undefined` if unknown. */
export function pairSpec(
  giveSymbol: string,
  wantSymbol: string,
  size: string,
): PairSpec | undefined {
  const give = TOKENS[giveSymbol];
  const want = TOKENS[wantSymbol];
  if (give === undefined || want === undefined) return undefined;
  return { giveSymbol, wantSymbol, give, want, size };
}

/**
 * Default sampling set: CC→USDCx at several sizes (both venues quote it, so it
 * yields a real cross-venue spread). Sizes respect the venues' min-swap amounts.
 */
export function defaultPairSpecs(): PairSpec[] {
  return (['125', '500', '1000'] as const).flatMap((size) => {
    const spec = pairSpec('CC', 'USDCx', size);
    return spec ? [spec] : [];
  });
}
