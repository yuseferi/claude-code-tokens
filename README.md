<p align="center">
  <img src="https://img.shields.io/npm/v/claude-token-statusbar" alt="npm version">
  <img src="https://img.shields.io/npm/dm/claude-token-statusbar" alt="npm downloads">
  <img src="https://img.shields.io/npm/l/claude-token-statusbar" alt="license">
  <img src="https://img.shields.io/badge/statusline-claude%20code-blueviolet" alt="Claude Code">
  <img src="https://img.shields.io/github/stars/yuseferi/claude-token-statusbar" alt="GitHub stars">
</p>

# claude-token-statusbar

A reactive token & cost status line for the **Claude Code** TUI. Live token counts,
cumulative session spend, and cache usage — right in the terminal, updated on every
message.

![statusline-demo](./docs/screenshots/statusline-anim.svg)

```
[Sonnet 5]  my-app  effort high  in 19.9k  out 16.0k  cache 25.3k/2.9k  ctx 12%  age 1h 30m  skills 3  $0.10
```

## Why?

Claude Code shows token usage only in the full screen `/status` view — which means
most people find out how much a session cost **after** the damage is done. With
`claude-token-statusbar` you always know, at a glance:

- **How many tokens** you've sent in and gotten back this session (cumulative)
- **What it cost** so far — in real time, so you can run `/compact` before it balloons
- **How much cache** you're writing vs. reading (the lever that drives cost down)
- Which **model** you're talking to

> 💡 Enterprise budgets (Anthropic, OpenAI, etc.) get exhausted fast when usage is
> invisible. Seeing the per-session cost climbing is the nudge most people need to
> `/compact` more often and keep long-running sessions lean.

## Features

- **Cumulative session totals** — parses the session transcript, so totals include
  every message (not just the current context window)
- **Cost tracking** — uses the client-estimated cost from Claude Code, with a
  transcript fallback so you see spend even in older sessions
- **Cache read/write breakdown** — know exactly how much prompt caching is doing
- **Session-hygiene nudges** — when the context window nears capacity, the session
  has been open for a while, or the 5h rate limit is nearly used, a second status
  line row appears with an action hint (start a new session, `/compact`, or close
  the session)
- **Skill suggestions** — when context is high, auto-detects a matching skill from
  `~/.claude/skills` or `.claude/skills` and suggests it (disable with
  `CLAUDE_TS_SKILLS=0`)
- **Context at a glance** — working folder, reasoning-effort level, session age,
  git branch (opt-in), and installed-skill count alongside the token metrics
- **Dependency-free** — pure Node, no npm runtime deps, never crashes the TUI
- **One-command install / uninstall** — writes the `statusLine` into your
  `~/.claude/settings.json` (with a `.bak` backup), or per-project
- **Fast** — transcript, git, and skill results are cached (per session or with a
  short TTL)

## Install

```bash
# install the CLI (anywhere)
npm install -g claude-token-statusbar

# configure the status line for the current user
claude-token-statusbar install
```

Restart `claude` (or start a new session) and the status line appears at the bottom.

> **Already have a `statusLine` set?** The installer detects it and refuses to
> overwrite — read the backup file or your existing config before changing.

## Usage

```bash
claude-token-statusbar install [--scope user|project]   # default: user (~/.claude)
claude-token-statusbar uninstall [--scope user|project]
claude-token-statusbar test                              # print a sample line
```

- `--scope user` writes to `~/.claude/settings.json` (recommended).
- `--scope project` writes to `<cwd>/.claude/settings.json`.
- No npx needed — `claude-token-statusbar` is a real binary after install.

### Manual setup (no installer)

Add to your `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node ~/.claude/statusline.mjs",
    "refreshInterval": 1
  }
}
```

The script lives at `~/.claude/statusline.mjs` after `install`.

## What you're looking at

The status line shows, left to right:

| Segment | Meaning |
| --- | --- |
| `[Model]` | `model.display_name` (context-size suffix, e.g. `(200k context)`, stripped) |
| `<folder>` | Working-directory basename from `workspace.current_dir` / `cwd` |
| `effort` | Reasoning-effort level, shown only when the model reports it |
| `git` | Git branch, opt-in via `CLAUDE_TS_GIT=1` (shown only inside a repo) |
| `in` | Cumulative input tokens this session |
| `out` | Cumulative output tokens this session |
| `cache` | Cumulative cache reads / cache writes |
| `ctx` | Live context-window usage % with a severity-colored progress bar (green below `CLAUDE_TS_CONTEXT_WARN`, yellow at warn, red at critical; hidden while null) |
| `age` | How long the session has been open (shown once ≥ 1 minute) |
| `skills` | Number of installed skills found in `~/.claude/skills` and `.claude/skills` |
| `$` | Cumulative session cost (client estimate) |

All token counts are **cumulative for the session** — summed from the session
transcript — rather than the current context window. Cost comes from
`cost.total_cost_usd` when present, falling back to summed `costUSD` from the
transcript.

## Nudges & configuration

When any threshold below is crossed, the status line prints a second row with an
action hint, e.g.:

```
[Sonnet 5]  my-app  effort high  in 19.9k  out 16.0k  cache 25.3k/2.9k  ctx 92% [█████░]  age 1h 30m  skills 3  $0.10
context 92% used — consider /compact or a new session
```

## Colors

The status line uses a small, consistent palette (see the demo above):

| Element | Color |
| --- | --- |
| Labels (`in`, `out`, `cache`, …) | Dim gray |
| `<folder>`, `effort`, `in` | Cyan |
| `out` | Magenta |
| `ctx` % + progress bar | Green → yellow at `CLAUDE_TS_CONTEXT_WARN` → red at `CLAUDE_TS_CONTEXT_CRIT` |
| `$` cost | Green under `$5`, yellow under `$20`, red at `$20`+ (bold) |
| `[Model]` | Bright-white on a gray chip |
| Nudge row | Warning nudge on a yellow banner; critical nudge on a red banner |

Set `NO_COLOR` to render plain monochrome text instead.

All knobs are environment variables with sensible defaults:

| Env var | Default | Meaning |
| --- | --- | --- |
| `CLAUDE_TS_CONTEXT_WARN` | `85` | Context % that triggers a yellow "consider `/compact`" nudge |
| `CLAUDE_TS_CONTEXT_CRIT` | `95` | Context % that triggers a red "start a new session" nudge |
| `CLAUDE_TS_AGE_WARN` | `2h` | Session wall-clock age that triggers a "consider closing it" nudge |
| `CLAUDE_TS_AGE_CRIT` | `4h` | Session age that triggers a red "consider closing it" nudge |
| `CLAUDE_TS_RATE_WARN` | `80` | 5h rate-limit % that triggers a usage nudge |
| `CLAUDE_TS_SKILLS` | `1` | Set to `0` to disable skill suggestions |
| `CLAUDE_TS_GIT` | `0` | Set to `1` to show the git branch on line 1 |
| `CLAUDE_TS_GIT_TTL` | `30` | Seconds to cache the git branch between refreshes |

Durations accept `ms`, `s`, `m`, `h` suffixes (e.g. `CLAUDE_TS_AGE_WARN=90m`).
Set them in your shell profile, or inline in the `command` in your
`~/.claude/settings.json`. Skill suggestions are found by scanning
`~/.claude/skills` and `<project>/.claude/skills` for `SKILL.md` files and
matching their `name`/`description` against context-related keywords (compact,
context, session, memory, …). They only appear when the context nudge fires.

> Git and skill counts are fetched once per TTL (`CLAUDE_TS_GIT_TTL`, or 30s) and
> cached in the temp dir, so the status line stays instant even at a 1s refresh.

## How it works

Claude Code's `statusLine` runs a command with a JSON payload on stdin, and
re-runs it whenever your context changes. This package renders one line from that
payload and sums the session transcript (`transcript_path`, a JSONL file) for true
cumulative totals. Results are cached per session and invalidated on file change,
so the status line stays instant.

## Compatibility

- Requires Node.js **20+**
- Tested with Claude Code **2.1.x** (statusline feature)
- Works with any model/plan Claude Code reports usage for

## Spread the word

Liked it? Star the repo, share it, or add the badge to your own README:

```markdown
[![Mentioned in Awesome Claude Code](https://awesome.re/mentioned-badge-flat.svg)](https://github.com/hesreallyhim/awesome-claude-code)
```

## Development

```bash
npm ci
npm run typecheck   # tsc --noEmit (strict, checkJs)
npm test            # node --test
```

## Contributing

Issues and PRs welcome — see [CONTRIBUTING](./CONTRIBUTING.md).

## License

MIT — see [LICENSE](./LICENSE).
