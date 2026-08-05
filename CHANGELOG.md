# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2026-08-05

### Fixed

- `install` copied only `statusline.mjs`, but 0.2.0's script imports the new
  `nudges.mjs` module. The installer now copies all local modules the script
  depends on, and `uninstall` removes them.

## [0.2.0] - 2026-08-05

### Added

- Session-hygiene nudges: when the context window nears capacity, the session
  has been open a long time, or the 5h rate limit is nearly used, a second
  status line row appears with an action hint (start a new session, `/compact`,
  or close the session).
- Skill suggestions: when context is high, the status line auto-detects a
  matching skill from `~/.claude/skills` or `.claude/skills` (`SKILL.md`
  `name`/`description`) and suggests it. Disable with `CLAUDE_TS_SKILLS=0`.
- Threshold tuning via environment variables: `CLAUDE_TS_CONTEXT_WARN` (85),
  `CLAUDE_TS_CONTEXT_CRIT` (95), `CLAUDE_TS_AGE_WARN` (2h), `CLAUDE_TS_AGE_CRIT`
  (4h), `CLAUDE_TS_RATE_WARN` (80).
- `NO_COLOR` support for the nudge row.

## [0.1.1] - 2026-08-05

### Fixed

- Token/cache totals were always 0 because Claude Code stores `usage` nested
  under `message.usage` in transcripts, not at the entry top level.
- Stale zeroed cache entries were served forever (cache key only checked
  mtime/size); the cache now carries a schema version that invalidates old
  entries.
- `install` now refreshes the copied `statusline.mjs` even when `statusLine`
  is already configured, so upgrading the npm package re-applies the fix.

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
