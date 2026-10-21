# Changelog

All notable changes to Docktor are documented in this file.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html), and each entry links the GitHub issue it belongs to.

## [Unreleased]

## [0.1.1] - 2026-10-21

Bug fixes and interface polish after the first release, with no new product features beyond the items listed under Added.

### Added

- The sidebar shows the running Docktor version and links to GitHub and the documentation above the account menu, also when collapsed to icons and in the phone menu ([#88](https://github.com/docktor-app/docktor/issues/88)).
- A Templates entry in the sidebar opens the template catalog as its own page, and "Use template" starts the create-stack flow ([#94](https://github.com/docktor-app/docktor/issues/94)).
- Settings configures SFTP (with an optional port) and S3-compatible backup repositories and can test the connection to the saved repository ([#68](https://github.com/docktor-app/docktor/issues/68)).

### Changed

- Sidebar entries are grouped under labelled sections, nested pages keep their parent entry highlighted, and the phone menu closes after navigating ([#93](https://github.com/docktor-app/docktor/issues/93)).
- Status labels use one lowercase vocabulary on the dashboard, stack list, stack header, services table and activity timeline ([#89](https://github.com/docktor-app/docktor/issues/89)).
- Dashboard numbers and selected technical values use the self-hosted Geist Mono font, with no request to an external font host ([#90](https://github.com/docktor-app/docktor/issues/90)).
- Forms share one spacing between labels, fields and buttons (login, sign-up, two-factor, create stack, health probe, setup wizard and dialogs) ([#92](https://github.com/docktor-app/docktor/issues/92)).
- Data tables share one bordered look, keep sorting, status pills and row actions, and turn into cards on narrow screens ([#95](https://github.com/docktor-app/docktor/issues/95)).
- The dashboard's "Backups Configured" card became "Backup Coverage", showing covered of total stacks and counting a stack with a schedule or at least one snapshot ([#85](https://github.com/docktor-app/docktor/issues/85)).
- The stack actions menu, theme toggle, certificate delete button, table pagination buttons and rows-per-page select have a 44px touch target on phones and keep their compact size on larger screens ([#71](https://github.com/docktor-app/docktor/issues/71)).
- On a stack's tabs the stack name in the breadcrumb links back to the stack overview, the stack header wraps on phones, and primary buttons read as verb plus noun ([#96](https://github.com/docktor-app/docktor/issues/96)).
- The stack migration dialog is larger, shows a real line diff of the compose changes, makes the pre-migration backup and stopping the old stack explicit steps, migrates a stack that already lives in Docktor's stacks folder in place, and runs in the background with live progress that survives a reload ([#72](https://github.com/docktor-app/docktor/issues/72)).

### Fixed

- Backups, restores and snapshot lists use the configured SFTP or S3 repository (one repository per stack) instead of silently writing to a local path, an incomplete remote configuration fails with a clear error, and local repositories and existing snapshots work as before ([#68](https://github.com/docktor-app/docktor/issues/68)).
- SFTP repositories connect with the stored private key and pin the server's host key on first use, and the image now includes the OpenSSH client ([#68](https://github.com/docktor-app/docktor/issues/68)).
- Deploy-time port warnings no longer flag ports held only by the stack's own containers, while a port held by another stack or process still warns and names the holder ([#76](https://github.com/docktor-app/docktor/issues/76)).
- "Import existing stack" no longer offers Docktor's own stack, explains why a folder was skipped, and shows stacks Docktor already manages as managed instead of importable ([#13](https://github.com/docktor-app/docktor/issues/13)).
- Originals kept by an in-place migration no longer appear as new stacks in the import scan ([#106](https://github.com/docktor-app/docktor/issues/106)).
- Stack migration keeps ownership, permissions, timestamps and symlinks of copied data, keeps each service's own environment values, refuses sources Docktor cannot read before changing anything, and rolls back cleanly on failure ([#72](https://github.com/docktor-app/docktor/issues/72)).
- A stopped stack shows as stopped right away without reloading the page ([#72](https://github.com/docktor-app/docktor/issues/72)).
- The stack tab bar no longer shows a scrollbar and stays swipeable on narrow screens ([#91](https://github.com/docktor-app/docktor/issues/91)).
- Live updates ignore a malformed event instead of breaking the page, and certificates about to expire report that status (partly addresses [#105](https://github.com/docktor-app/docktor/issues/105), which stays open).

## [0.1.0] - 2026-10-13

First public release, see the [v0.1.0 release notes](https://github.com/docktor-app/docktor/releases/tag/v0.1.0).

[Unreleased]: https://github.com/docktor-app/docktor/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/docktor-app/docktor/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/docktor-app/docktor/releases/tag/v0.1.0
