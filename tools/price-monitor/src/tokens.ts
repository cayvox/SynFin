import type { AssetId } from '@synfin/spec';

/**
 * Tokens the monitor can request, by symbol. Mirrors CantonSwap's live
 * `GET /nswap/tokens` catalog (decimals/admin); `instrumentId` is what the venue
 * adapters expect (both use `Amulet` for CC). Demo convenience map, not a registry.
 */
export const TOKENS: Readonly<Record<string, AssetId>> = {
  CC: {
    registry:
      'DSO::1220b1431ef217342db44d516bb9befde802be7d8899637d290895fa58880f19accc',
    instrumentId: 'Amulet',
    decimals: 10,
  },
  USDCx: {
    registry:
      'decentralized-usdc-interchain-rep::12208115f1e168dd7e792320be9c4ca720c751a02a3053c7606e1c1cd3dad9bf60ef',
    instrumentId: 'USDCx',
    decimals: 6,
  },
  CBTC: {
    registry:
      'cbtc-network::12205af3b949a04776fc48cdcc05a060f6bda2e470632935f375d1049a8546a3b262',
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
