# Vendored CIP‑0056 token‑standard DARs

These are the **real** Canton Network Token Standard (CIP‑0056) interface DARs (and the
Amulet test token + helpers), built from the official source and vendored here so the Daml
build/tests and CI are reproducible without re‑cloning the Splice monorepo. See
[ADR‑0008](../../docs/decisions/0008-atomic-multileg-settlement.md).

**Provenance (all Apache‑2.0, © Digital Asset):**

- Source: `hyperledger-labs/splice`, branch **`canton-3.4`**, commit `2dbbab8ab8a5d65e906f2565ba5a460c8125720a`.
- Built with Daml SDK **`3.3.0-snapshot.20250507.0`** (the nearest publicly‑installable
  snapshot on the token‑standard's `3.3.0` line; the exact upstream pin
  `3.3.0-snapshot.20250502.13767.0.v2fc6c7e2` is an internal Artifactory build not published
  as an installable SDK — see ADR‑0008).

| DAR | Version | Used by |
| --- | --- | --- |
| `splice-api-token-metadata-v1` | 1.0.0 | library + tests |
| `splice-api-token-holding-v1` | 1.0.0 | library + tests |
| `splice-api-token-transfer-instruction-v1` | 1.0.0 | tests |
| `splice-api-token-allocation-v1` | 1.0.0 | library + tests |
| `splice-api-token-allocation-request-v1` | 1.0.0 | library + tests |
| `splice-api-token-allocation-instruction-v1` | 1.0.0 | tests |
| `splice-api-featured-app-v1` | 1.0.0 | tests (Amulet) |
| `splice-util` | 0.1.4 | tests (Amulet) |
| `splice-amulet` | 0.1.14 | tests (Amulet) |

## Regenerating

Run [`../scripts/build-splice-dars.sh`](../scripts/build-splice-dars.sh). It clones the pinned
branch, builds the interface + Amulet chain with the pinned SDK, and refreshes these DARs and
the vendored test‑harness source under
`daml/synfin-settlement-test/daml/Splice/Testing/` (which must be copied as source, not shared
via DAR — a current token‑standard limitation).
