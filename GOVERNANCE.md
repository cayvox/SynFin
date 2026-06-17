# Governance

Synfin is **neutral infrastructure**. Its long‑term value to the Canton ecosystem depends on every participant trusting that the standard is not tilted toward any single vendor — including its steward. This document defines how Synfin is governed and how that neutrality is protected.

## 1. Mission & neutrality charter

- Synfin's purpose is to be an **open, vendor‑neutral standard** for quote discovery, swap intent and atomic settlement on the Canton Network, plus an Apache‑2.0 reference implementation.
- The specification MUST remain implementable by anyone, at no cost, without depending on any proprietary product.
- The reference implementation MUST remain fully functional on its own. No feature of the standard may *require* a closed component.

## 2. Stewardship & roles

- **Steward:** Cayvox Labs currently maintains the project and chairs the review process. Stewardship is a responsibility, not ownership of the standard.
- **Maintainers:** individuals with merge rights, listed in `MAINTAINERS` (added once the project has external contributors). Maintainers are added by consensus of existing maintainers based on sustained, high‑quality contribution.
- **Contributors:** anyone who opens an issue, PR, or RFC.
- **Adopters:** venues, wallets and tools that implement the standard. Adopters are invited to the review of any change that affects conformance.

## 3. Conflict of interest (important)

Cayvox Labs operates a **proprietary routing optimizer and hosted execution service** that build on this standard. To keep the standard honest:

- Changes that would advantage the proprietary optimizer over other implementations are **prohibited**. The open `Router` port and the reference router define the neutral baseline.
- Any maintainer with a commercial interest in a specific proposal SHOULD disclose it in the PR/RFC and SHOULD recuse themselves from being the sole approver.
- Conformance tests are the arbiter: a change is acceptable only if any conformant implementation can adopt it on equal terms.

## 4. Decision‑making

- **Day‑to‑day code changes:** normal PR review (see CONTRIBUTING.md). At least one maintainer approval and green CI.
- **Design changes & spec changes:** require an **ADR** (architecture) or **RFC** (normative spec). See §5.
- **Disagreement:** resolved by maintainer consensus; if consensus fails, the steward decides and records the rationale publicly. This is a temporary fallback intended to be replaced by a broader council as adoption grows.

## 5. Changing the specification (RFC process)

The specification in `docs/spec/SPECIFICATION.md` is normative and versioned with SemVer.

1. Open an RFC issue describing the problem, the proposed change, compatibility impact, and conformance‑test impact.
2. Minimum **14‑day** public review window for any change that affects conformance or wire formats.
3. Adopters affected by the change are explicitly invited to comment.
4. On acceptance: update the spec, bump its version, update the conformance suite, and record an ADR.

- **MAJOR** spec bump: backward‑incompatible wire/interface change.
- **MINOR** spec bump: backward‑compatible additions (new optional fields, new quote source kinds).
- **PATCH** spec bump: clarifications, typo fixes, non‑normative notes.

## 6. CIP track

Synfin's specification is intended to be submitted to the Canton / Global Synchronizer Foundation **CIP process** as the standard matures. The repository spec is the working source of truth; the CIP submission tracks it. Alignment with **CIP‑0056** (the Token Standard) is a hard requirement, not a goal.

## 7. Releases & versioning

See [ENGINEERING.md](ENGINEERING.md) §Releases. Packages and the spec are versioned independently but the spec version a release targets is always recorded in `CHANGELOG.md`.

## 8. Code of conduct

All participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Enforcement is the maintainers' responsibility.

## 9. Amending this document

Changes to governance follow the same RFC process (§5) with a 14‑day review window and require steward sign‑off.
