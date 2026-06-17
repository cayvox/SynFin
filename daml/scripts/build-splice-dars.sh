#!/usr/bin/env bash
# Build the real CIP-0056 token-standard DARs (and Amulet test deps) from the
# pinned Splice source and vendor them into daml/dars/, plus refresh the
# test-harness source. Reproduces ADR-0008's pinned environment.
#
# Prereqs: a Daml SDK able to install the pinned snapshot (assistant or DPM), a
# JDK 17, and git. See daml/dars/README.md and CONTRIBUTING.md.
set -euo pipefail

SPLICE_BRANCH="canton-3.4"
SPLICE_COMMIT="2dbbab8ab8a5d65e906f2565ba5a460c8125720a"
SDK="3.3.0-snapshot.20250507.0"   # nearest public snapshot to the upstream pin (ADR-0008)

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DARS_DIR="$REPO_ROOT/daml/dars"
HARNESS_DST="$REPO_ROOT/daml/synfin-settlement-test/daml/Splice/Testing"
WORK="${SPLICE_WORKDIR:-$HOME/synfin-splice}"

echo ">>> Installing Daml SDK $SDK (if missing)"
daml install "$SDK" --install-assistant no || true

echo ">>> Sparse-cloning splice@$SPLICE_BRANCH into $WORK"
rm -rf "$WORK"
git clone --filter=blob:none --no-checkout --depth 1 -b "$SPLICE_BRANCH" \
  https://github.com/hyperledger-labs/splice.git "$WORK"
cd "$WORK"
git sparse-checkout init --cone
git sparse-checkout set token-standard daml/splice-amulet daml/splice-util daml/splice-api-featured-app-v1
git checkout

# Build the dependency chain in topological order (pure `daml build`).
PKGS=(
  token-standard/splice-api-token-metadata-v1
  token-standard/splice-api-token-holding-v1
  token-standard/splice-api-token-transfer-instruction-v1
  token-standard/splice-api-token-allocation-v1
  token-standard/splice-api-token-allocation-request-v1
  token-standard/splice-api-token-allocation-instruction-v1
  daml/splice-api-featured-app-v1
  daml/splice-util
  daml/splice-amulet
)
for p in "${PKGS[@]}"; do
  sed -i.bak -E "s|^sdk-version:.*|sdk-version: $SDK|" "$p/daml.yaml" && rm -f "$p/daml.yaml.bak"
  name="$(awk '/^name:/{print $2}' "$p/daml.yaml")"
  echo ">>> building $name"
  ( cd "$p" && daml build )
  dar="$(ls "$p"/.daml/dist/${name}-*.dar | grep -v current | head -1)"
  cp "$dar" "$p/.daml/dist/${name}-current.dar"   # sibling data-deps reference *-current.dar
  cp "$dar" "$DARS_DIR/${name}.dar"
done

echo ">>> Refreshing vendored test-harness source"
rm -rf "$HARNESS_DST"
cp -R "$WORK/token-standard/splice-token-standard-test/daml/Splice/Testing" "$HARNESS_DST"

echo ">>> Done. Vendored DARs in $DARS_DIR ; harness source in $HARNESS_DST"
