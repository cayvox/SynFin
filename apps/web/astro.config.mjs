// @ts-check
import { defineConfig } from 'astro/config';

// Static, content-first site (STACK.md): ships ~zero JS by default; interactive
// bits are isolated islands. Built from the monorepo root; deploys to Cloudflare
// Pages. The canonical domain is configurable (domain pending — CONTENT.md).
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://synfin.xyz',
  trailingSlash: 'never',
  build: { format: 'directory' },
});
