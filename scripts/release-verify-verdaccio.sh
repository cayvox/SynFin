#!/usr/bin/env bash
# Full local release proof: publish the @synfin publish set to a throwaway
# Verdaccio registry using the SAME shared publish script as the production
# workflow (scripts/release/publish-package.mjs), install it in a clean room
# OUTSIDE the workspace, and run a no-network smoke (route over mock quotes ->
# RoutePlan) plus a downstream tsc. Because the proof publishes through the exact
# production path (workspace rewrite + npm publish), the artifact proven
# installable here is the artifact that ships. It publishes nothing real.
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
BACKUP="$(mktemp -d /tmp/synfin-manifests.XXXX)"
SET="spec adapters router-ref conformance cli" # topological order

cleanup() {
  pkill -f "verdaccio --config $CFG" 2>/dev/null || true
  # The shared publish script rewrites packages/*/package.json in place; restore
  # the originals so the working tree is left clean.
  if [ -d "$BACKUP" ]; then
    for name in $SET; do
      [ -f "$BACKUP/$name.json" ] && cp "$BACKUP/$name.json" "$ROOT/packages/$name/package.json"
    done
  fi
  rm -rf "$STORE" "$NPMRC" "$CFG" "$CONSUME" "$BACKUP"
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

echo "• backing up workspace manifests (the publish script rewrites them) …"
for name in $SET; do cp "$ROOT/packages/$name/package.json" "$BACKUP/$name.json"; done

# Publish via the SAME script the production workflow uses, so the artifact proven
# here is exactly the artifact that ships. No --provenance: Sigstore needs CI OIDC.
echo "• publishing the set to verdaccio via scripts/release/publish-package.mjs (topological order) …"
for name in $SET; do
  NPM_CONFIG_USERCONFIG="$NPMRC" \
    node "$ROOT/scripts/release/publish-package.mjs" "$ROOT/packages/$name" \
      --registry "$REG" --tag next --access public
  echo "  published @synfin/$name"
done

echo "• clean-room install + ESM smoke + tsc …"
cd "$CONSUME"
# `pnpm run` injects npm_config_* (including a registry pointing at npmjs) into
# the environment, which would override this clean room's .npmrc. Clear them so
# the clean room is hermetic and resolves only through Verdaccio.
for v in $(env | sed -n 's/^\(npm_config_[A-Za-z0-9_]*\)=.*/\1/p'); do unset "$v"; done
printf 'registry=%s/\n//localhost:4873/:_authToken=fake\n' "$REG" > .npmrc
npm init -y >/dev/null 2>&1
node -e "const p=require('./package.json');p.type='module';require('fs').writeFileSync('package.json',JSON.stringify(p))"
npm install --registry "$REG" @synfin/router-ref @synfin/spec @synfin/adapters >/dev/null 2>&1
npm install --registry "$REG" -D typescript @types/node >/dev/null 2>&1
cp "$ROOT/scripts/fixtures/consume-smoke.mjs" smoke.mjs
cp "$ROOT/scripts/fixtures/consume.ts" consumer.ts
printf '{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","target":"es2022","strict":true,"noEmit":true,"skipLibCheck":true},"files":["consumer.ts"]}' > tsconfig.bundler.json
printf '{"compilerOptions":{"module":"node16","moduleResolution":"node16","target":"es2022","strict":true,"noEmit":true,"skipLibCheck":true},"files":["consumer.ts"]}' > tsconfig.node16.json
node smoke.mjs
npx tsc -p tsconfig.bundler.json && echo "  tsc bundler: PASS"
npx tsc -p tsconfig.node16.json && echo "  tsc node16: PASS"

# The CLI offline quote must work from a registry install: it reads its own
# bundled fixtures, not @synfin/adapters/fixtures (which is not shipped).
echo "• cli offline quote (bundled fixtures) …"
npm install --registry "$REG" @synfin/cli >/dev/null 2>&1
CLI_OUT="$(./node_modules/.bin/synfin quote CC USDCx 125 --fixtures 2>&1 || true)"
echo "$CLI_OUT" | sed 's/^/    /'
if echo "$CLI_OUT" | grep -q "Best route" && ! echo "$CLI_OUT" | grep -qiE "fallback failed|is not defined by"; then
  echo "  cli offline quote: PASS"
else
  echo "  cli offline quote: FAIL"
  exit 1
fi

echo ""
echo "release:verify:verdaccio PASSED: a downstream consumer can install and use @synfin from a registry, and the CLI offline quote works."
