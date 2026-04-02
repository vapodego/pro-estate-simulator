# Changelog

## 2026-04-02

### Added

- Added `Deal` JSON import and export so downstream simulation assumptions and results can round-trip with the shared deal document.
- Added `NEW_DEVELOPMENT` investment mode alongside the existing asset workflow.
- Added development input fields for land price, construction cost, soft cost, other cost, contingency, construction period, lease-up, and interest-only setup.
- Added a project favicon for browser tabs.

### Changed

- Extended the simulation engine to support development-oriented cash flow behavior without breaking the existing asset mode.
- Updated the app theme to a muted orange palette aligned with the Pro Estate Simulator favicon.
- Wired development-mode outputs back into `rent`, `costs`, `finance`, `simulation`, and `decision` sections of the shared `Deal` contract.
