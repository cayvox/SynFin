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

### Installing the pinned SDK (CI and local)

The `get.daml.com` installer cannot resolve this snapshot in a headless/CI shell. Install
deterministically from the pinned **GitHub release tarball** instead — its bundled `install.sh`
installs from the extracted directory (no network version resolution) under the version in its
`daml_version.txt` (= `3.3.0-snapshot.20250507.0`), matching every `daml.yaml` pin:

- **Version:** `3.3.0-snapshot.20250507.0`
- **Source URL (linux/amd64):**
  `https://github.com/digital-asset/daml/releases/download/v3.3.0-snapshot.20250507.0/daml-sdk-3.3.0-snapshot.20250502.13767.0.v2fc6c7e2-linux-x86_64.tar.gz`
  (the release tag is `v3.3.0-snapshot.20250507.0`; the tarball's internal build id is
  `…20250502.13767.0.v2fc6c7e2`. macOS: swap `linux-x86_64` for `macos-x86_64`.)

```sh
curl -fL "$URL" -o /tmp/daml-sdk.tar.gz && tar xzf /tmp/daml-sdk.tar.gz -C /tmp && /tmp/sdk-*/install.sh
```

A JDK 17 (e.g. Temurin) is required for `daml test` / sandbox (the Daml Script service needs a
JVM); `daml build` alone does not. The CI `daml` job uses exactly this install path.

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
