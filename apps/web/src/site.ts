/**
 * Site-wide constants (URLs, contact). Local to apps/web — the website is a leaf
 * app and does not import from the protocol/Daml/tools packages. Domain is
 * pending (CONTENT.md), so the canonical is configurable via SITE_URL.
 */
export const REPO = 'https://github.com/cayvox/SynFin';
export const SPEC = `${REPO}/blob/main/docs/spec/SPECIFICATION.md`;
export const DOCS = `${REPO}/tree/main/docs`;
export const NPM = 'https://www.npmjs.com/org/synfin';
export const CAYVOX = 'https://cayvox.com';
export const EMAIL = 'info@cayvox.com';
export const CANONICAL =
  (import.meta.env.SITE as string | undefined) ?? 'https://synfin.xyz';
