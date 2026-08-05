# Promotion Kit

Ready-to-paste posts for sharing `claude-token-statusbar`. Pick a platform, paste,
post. All copy is friendly and non-spammy; links to the repo
`https://github.com/yuseferi/claude-token-statusbar`.

---

## Slack (company / team)

> Hey everyone 👋
>
> I put together a small open-source tool that's been super useful for me, and I
> wanted to share it in case anyone else hits the same wall I did.
>
> **The problem:** We all know Claude Code budget gets consumed fast, but Claude Code
> gives you almost no visibility into *where* it's going. You only see a cost summary
> in the full `/status` view, and it's easy to burn through a monthly budget without
> noticing until it's too late.
>
> **The tool:** `claude-token-statusbar` — a little status bar at the bottom of the
> Claude Code TUI. Live, on every message:
>
> - cumulative tokens in/out for the session
> - prompt cache usage (read/write)
> - **cost per session**, updated in real time
>
> So you always know what a session is costing you *before* it balloons — and when it
> starts getting big, that's your cue to run `/compact` more often. I found I slash my
> spend a lot when I can actually see the number climbing.
>
> **Try it:**
> ```bash
> npm install -g claude-token-statusbar
> claude-token-statusbar install
> ```
> Restart `claude` and it shows up at the bottom. MIT, zero dependencies, and easy to
> remove (`claude-token-statusbar uninstall`).
>
> Repo: https://github.com/yuseferi/claude-token-statusbar
>
> Happy to take feedback or feature ideas!

---

## X / Twitter (short)

> Claude Code hides your token/cost usage behind `/status` — so you only realize a
> session ate $30 when it's over.
>
> I built a tiny status bar that shows cumulative in/out tokens, prompt cache, and
> **live session cost** at the bottom of the TUI, updating on every message.
>
> Zero deps, MIT, one command to install:
> `npm install -g claude-token-statusbar && claude-token-statusbar install`
>
> Repo: https://github.com/yuseferi/claude-token-statusbar

---

## X / Twitter (thread)

> Tweet 1:
> PSA for heavy Claude Code users: you cannot see your live token/cost usage in the
> TUI — it's buried in `/status`. That's how $1000 enterprise budgets vanish.
>
> Tweet 2:
> So I built `claude-token-statusbar`: cumulative session tokens (in/out), prompt
> cache read/write, and real-time session cost — a single line at the bottom of the
> terminal, refreshing on every message.
>
> Tweet 3:
> See the cost climbing? That's your signal to `/compact`. Knowing the number makes
> you spend dramatically less.
>
> Tweet 4:
> `npm install -g claude-token-statusbar && claude-token-statusbar install`
> MIT, zero dependencies. https://github.com/yuseferi/claude-token-statusbar

---

## LinkedIn

> I keep seeing a painful pattern with Claude Code adoption: teams love the tool,
> then someone hits the monthly budget ceiling and it becomes "that expensive AI".
> The root cause is almost always the same — **usage is invisible until it's too
> late.** Token counts and session cost are buried behind the `/status` screen.
>
> So I built a small, dependency-free status bar for the Claude Code TUI that puts
> the numbers front and center, updating live on every message:
>
> • Cumulative input/output tokens for the session
> • Prompt cache usage (read vs. write)
> • Real-time session cost
>
> The practical impact: when you can watch a session's cost climb, you start running
> `/compact` at the right moment instead of after the fact. Long-running sessions
> stay lean, and budgets stop being a surprise.
>
> Open source (MIT), one-line install, zero dependencies:
> https://github.com/yuseferi/claude-token-statusbar
>
> If you run Claude Code at work, it's a 60-second setup that pays for itself in one
> session.

---

## Reddit (r/ClaudeAI, r/ClaudeCode) — self-post

> **Title:** `claude-token-statusbar` — live token/cost bar for the Claude Code TUI
>
> **Body:**
> I got tired of finding out a session cost $30 after it was already over. Claude
> Code only surfaces token usage in the full `/status` view, so I built a minimal
> status bar that shows:
>
> - cumulative in/out tokens this session
> - prompt cache read/write
> - **live session cost** (updates on every message)
>
> It parses the session transcript for true cumulative totals (not just the current
> context window) and caches per session, so it's instant. Zero npm deps, never
> crashes the TUI.
>
> The killer feature for me: seeing the cost number climb makes me `/compact` way
> more proactively, and my spend per session dropped noticeably.
>
> ```bash
> npm install -g claude-token-statusbar
> claude-token-statusbar install
> ```
>
> Repo: https://github.com/yuseferi/claude-token-statusbar
>
> MIT. Happy to take ideas/PRs. *(not a plugin — it uses Claude Code's built-in
> statusLine feature, so no plugin needed)*

---

## Hacker News (Show HN)

> **Title:** Show HN: claude-token-statusbar — live token & cost bar for Claude Code
>
> **Text:**
> Claude Code is great but gives you almost zero real-time visibility into token
> usage — the only summary is buried in `/status`. That invisibility is how
> enterprise budgets ($1000/mo) get eaten without anyone noticing.
>
> I built a tiny status line that sits at the bottom of the TUI and updates on every
> message:
>
> - cumulative input/output tokens for the session
> - prompt cache read/write split
> - live session cost
>
> It reads the JSONL session transcript for true cumulative totals (not just the
> context window) and caches by session id + file mtime, so it adds ~no latency.
> Zero runtime dependencies, pure Node, never throws into the TUI.
>
> Install:
> ```bash
> npm install -g claude-token-statusbar
> claude-token-statusbar install   # writes statusLine into ~/.claude/settings.json
> ```
>
> Repo + animated demo: https://github.com/yuseferi/claude-token-statusbar
>
> Tech notes for the curious: relies on Claude Code's native statusLine feature
> (shell command + JSON on stdin), transcript parsing is a simple JSONL sum, cache is
> invalidated by schema version + mtime/size.
>
> Would love feedback, especially on edge cases in transcript formats.

---

## Pitch blurb (one-liners for comments/DMs)

- "Stop finding out your Claude Code session cost $30 after it's over — a one-line
  status bar shows live session cost + tokens, so you know when to /compact."
- "Claude Code's /status is the only place token usage lives. I moved it to the
  bottom of the screen, updating every message. Zero deps, one command."
