import type { AssetId } from '@synfin/spec';

/**
 * Known tokens the CLI can quote, by symbol. The `instrumentId` matches what the
 * venue adapters expect (CantonSwap/OneSwap use `Amulet` for CC); decimals and
 * registry (instrument admin) mirror CantonSwap's live `GET /nswap/tokens`
 * catalog captured 2026-06-18. This is a demo convenience map, not a registry.
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

/** Resolve a CLI symbol (e.g. `CC`, `USDCx`) to its {@link AssetId}. */
export function resolveToken(symbol: string): AssetId | undefined {
  return TOKENS[symbol];
}
