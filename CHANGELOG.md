# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-08-05

### Added

- Reactive status line for the Claude Code TUI: model, cumulative input/output
  tokens, cache read/write, and session cost on one line.
- Cumulative session totals parsed from the session transcript (JSONL), cached
  per `session_id` and invalidated on file mtime/size change.
- Cost from `cost.total_cost_usd` with transcript `costUSD` fallback.
- `install` / `uninstall` / `test` CLI writing the `statusLine` block into
  `~/.claude/settings.json` (user scope) or `<cwd>/.claude/settings.json`
  (project scope), with `.bak` backup and idempotent re-install.
- Zero runtime dependencies; renders without ever throwing into the TUI.
- Node 20+ support, strict `checkJs` typecheck, `node:test` suite.
