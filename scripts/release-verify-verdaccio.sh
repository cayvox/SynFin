#!/usr/bin/env bash
# Full local release proof: publish the @synfin publish set to a throwaway
# Verdaccio registry, install it in a clean room OUTSIDE the workspace, and run a
# no-network smoke (route over mock quotes -> RoutePlan) plus a downstream tsc.
# This proves the real publish command works (including workspace:* rewrite) and
# that a consumer can install and use the packages. It publishes nothing real.
#
# Local use only (needs a writable /tmp and network for the npmjs uplink). CI
# runs the static checks (scripts/release-verify.mjs); this is the deeper proof.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REG="http://localhost:4873"
STORE="$(mktemp -d /tmp/verdaccio-store.XXXX)"
NPMRC="$(mktemp /tmp/verdaccio.npmrc.XXXX)"
CFG="$(mktemp /tmp/verdaccio.cfg.XXXX.yaml)"
CONSUME="$(mktemp -d /tmp/synfin-consume.XXXX)"
SET="spec adapters router-ref conformance cli" # topological order

cleanup() {
  pkill -f "verdaccio --config $CFG" 2>/dev/null || true
  rm -rf "$STORE" "$NPMRC" "$CFG" "$CONSUME"
}
trap cleanup EXIT

cat > "$CFG" <<YAML
storage: $STORE
auth: { htpasswd: { file: $STORE/htpasswd, max_users: -1 } }
uplinks: { npmjs: { url: https://registry.npmjs.org/, cache: true } }
packages:
  '@synfin/*': { access: \$all, publish: \$all, unpublish: \$all }
  '@*/*': { access: \$all, publish: \$all, proxy: npmjs }
  '**': { access: \$all, publish: \$all, proxy: npmjs }
log: { type: stdout, format: pretty, level: warn }
YAML
printf 'registry=%s/\n//localhost:4873/:_authToken=fake\n' "$REG" > "$NPMRC"

echo "• starting verdaccio …"
nohup npx --yes verdaccio --config "$CFG" --listen 4873 >/dev/null 2>&1 &
for i in $(seq 1 30); do curl -sf "$REG/-/ping" >/dev/null 2>&1 && break; sleep 1; done

echo "• publishing the set to verdaccio (topological order) …"
for name in $SET; do
  ( cd "$ROOT/packages/$name" && NPM_CONFIG_USERCONFIG="$NPMRC" \
      pnpm publish --registry "$REG" --tag next --no-git-checks >/dev/null )
  echo "  published @synfin/$name"
done

echo "• clean-room install + ESM smoke + tsc …"
cd "$CONSUME"
printf 'registry=%s/\n//localhost:4873/:_authToken=fake\n' "$REG" > .npmrc
npm init -y >/dev/null 2>&1
node -e "const p=require('./package.json');p.type='module';require('fs').writeFileSync('package.json',JSON.stringify(p))"
npm install @synfin/router-ref @synfin/spec @synfin/adapters >/dev/null 2>&1
npm install -D typescript @types/node >/dev/null 2>&1
cp "$ROOT/scripts/fixtures/consume-smoke.mjs" smoke.mjs
cp "$ROOT/scripts/fixtures/consume.ts" consumer.ts
printf '{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","target":"es2022","strict":true,"noEmit":true,"skipLibCheck":true},"files":["consumer.ts"]}' > tsconfig.bundler.json
printf '{"compilerOptions":{"module":"node16","moduleResolution":"node16","target":"es2022","strict":true,"noEmit":true,"skipLibCheck":true},"files":["consumer.ts"]}' > tsconfig.node16.json
node smoke.mjs
npx tsc -p tsconfig.bundler.json && echo "  tsc bundler: PASS"
npx tsc -p tsconfig.node16.json && echo "  tsc node16: PASS"

echo ""
echo "release:verify:verdaccio PASSED: a downstream consumer can install and use @synfin from a registry."
