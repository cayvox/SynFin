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

/** Resolve a CLI symbol (e.g. `CC`, `USDCx`) to its {@link AssetId}. */
export function resolveToken(symbol: string): AssetId | undefined {
  return TOKENS[symbol];
}
