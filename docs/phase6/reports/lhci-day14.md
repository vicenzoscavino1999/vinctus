# Day 14 LHCI Expansion

This phase expands Lighthouse CI coverage to the four key flows defined for Phase 6:

- Home: `/discover`
- Feed: `/feed`
- Chat: `/messages`
- Groups: `/group/1` (seeded group document)

## Commands

- Install browser runtime (one-time):
  - `npm run lhci:install-browser`
- Local with emulators + seed:
  - `npm run lhci:emulators`
- Direct LHCI run (assumes app server + auth context already available):
  - `npm run lhci`
- Strict gate run (`>= 0.90` as error):
  - `npm run lhci:strict`

## Gate

- Assertion: `categories:performance >= 0.90` for each audited URL
- Default mode (`npm run lhci`): warning when score < 0.90
- Strict mode (`npm run lhci:strict`): error when score < 0.90
- Config file: `.lighthouserc.cjs`
- Auth bootstrap script: `scripts/lhci-auth.cjs`
- Local artifacts: `.lighthouseci/` (gitignored)
- Default throttling profile: `provided` (desktop real runtime, no simulated network/CPU throttle)
- Optional override: `LHCI_THROTTLING_METHOD=simulate` for stress profiling

## Notes

- The auth bootstrap uses seeded emulator credentials by default:
  - `alice@vinctus.local` / `password123`
- Override via environment variables if needed:
  - `LHCI_AUTH_EMAIL`
  - `LHCI_AUTH_PASSWORD`
  - `LHCI_BASE_URL`

## Current baseline (2026-02-06)

- Home `/discover`: `0.95`
- Feed `/feed`: `0.99`
- Chat `/messages`: `1.00`
- Groups `/group/1`: `0.97`
