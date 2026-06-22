# Security Policy

Synfin moves value and coordinates settlement of tokenized assets. Security is treated as a first‑class, non‑negotiable requirement.

## Reporting a vulnerability

**Please do not open public issues or pull requests for security problems.**

- Email **security@synfin.dev** (placeholder — replace before launch), or
- Use **GitHub Private Vulnerability Reporting** ("Report a vulnerability" on the Security tab).

Include: affected component/version, a description, reproduction steps or PoC, and impact assessment. A PGP key for encrypted reports will be published at launch.

## Our commitment

- **Acknowledgement** within 3 business days.
- **Triage & severity assessment** within 7 business days, using CVSS as a guide.
- **Coordinated disclosure**: we will agree a disclosure timeline with you, typically up to 90 days, and credit you unless you prefer to remain anonymous.

## Supported versions

Until `v1.0.0` (pre‑alpha), only the latest `main` and the latest tagged pre‑release receive fixes. A formal support matrix will be published at `v1.0.0`.

## Scope

In scope: the specification, the Daml atomic split‑execution library, venue adapters, the SDK, the reference UI, and the Phase‑0 monitor in this repository.

Out of scope: third‑party venues, the (separate) proprietary optimizer and hosted services, and issues that require a compromised user device or compromised Canton validator.

## Security posture

- The atomic settlement library and any allocation‑handling code are the highest‑sensitivity surface and require Daml Script tests covering all‑or‑nothing semantics, abort paths, and expiry. See [THREAT_MODEL.md](THREAT_MODEL.md).
- An **independent third‑party audit is required before any mainnet deployment**.
- Supply‑chain controls (pinned dependencies, signed tags, SBOM) are described in [ENGINEERING.md](ENGINEERING.md).

## Known advisories

- **GHSA-2g4f-4pwh-qvx6 (ajv ReDoS via the `$data` option).** `@synfin/spec` depends on `ajv` for runtime validation, so `npm audit` may surface this moderate advisory. It does not apply to how Synfin uses ajv. The advisory only affects schemas compiled with the `$data` option enabled. `@synfin/spec` constructs ajv without `$data` (`new Ajv2020({ allErrors: true, strict: false })`) and compiles only its own committed JSON Schemas, none of which reference `$data`, so there is no vulnerable path. We will move to a fixed ajv release when one is available.

## Safe harbor

We will not pursue legal action against researchers who act in good faith, avoid privacy violations and service disruption, and give us reasonable time to remediate before public disclosure.
