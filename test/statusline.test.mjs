import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { nudge } from "../src/nudges.mjs"

const PKG_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const RENDERER = path.join(PKG_DIR, "src", "statusline.mjs")

/** Isolated HOME so skill scans are deterministic (no user skills in tests). */
const HOME_ISOLATION = fs.mkdtempSync(path.join(os.tmpdir(), "ccs-home-"))

function runRenderer(payload, env = {}) {
  const result = spawnSync(process.execPath, [RENDERER], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, HOME: HOME_ISOLATION, ...env },
  })
  return result.stdout.trim()
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, "")
}

function writeTranscript(dir, lines) {
  const file = path.join(dir, "session.jsonl")
  fs.writeFileSync(file, lines.join("\n") + "\n")
  return file
}

function writeSkill(dir, name, description) {
  const skillDir = path.join(dir, name)
  fs.mkdirSync(skillDir, { recursive: true })
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), `---\nname: ${name}\ndescription: "${description}"\n---\n`)
}

const EMPTY_PATHS = { home: "", cwd: "", envDir: undefined }

test("formats and sums a transcript into a status line", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ccs-"))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))

  const transcript = writeTranscript(dir, [
    JSON.stringify({ type: "user", message: { role: "user", content: "hi" } }),
    JSON.stringify({
      type: "assistant",
      message: { usage: { input_tokens: 12300, output_tokens: 4500, cache_read_input_tokens: 8200, cache_creation_input_tokens: 1000 } },
    }),
    JSON.stringify({
      type: "assistant",
      message: { usage: { input_tokens: 200, output_tokens: 100, cache_read_input_tokens: 50, cache_creation_input_tokens: 10 } },
    }),
    JSON.stringify({ type: "garbage-not-json" }),
  ])

  const line = stripAnsi(
    runRenderer({
      session_id: "sess-1",
      transcript_path: transcript,
      model: { display_name: "Sonnet" },
      cost: { total_cost_usd: 0.42 },
    }),
  )

  assert.match(line, /\[Sonnet\]/)
  assert.match(line, /in 12\.5k/)
  assert.match(line, /out 4\.6k/)
  assert.match(line, /cache 8\.3k\/1\.0k/)
  assert.match(line, /\$0\.42/)
})

test("falls back to transcript cost when stdin cost is missing", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ccs-"))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))

  const transcript = writeTranscript(dir, [
    JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 1000, output_tokens: 100 } }, costUSD: 0.123 }),
  ])

  const line = stripAnsi(
    runRenderer({ session_id: "sess-2", transcript_path: transcript, model: { display_name: "Opus" } }),
  )

  assert.match(line, /\$0\.12/)
})

test("parses real Claude Code transcript shape (usage nested in message)", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ccs-"))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))

  const transcript = writeTranscript(dir, [
    JSON.stringify({ type: "mode", mode: "normal" }),
    JSON.stringify({
      type: "assistant",
      message: {
        model: "claude-sonnet-5",
        usage: { input_tokens: 2, output_tokens: 20, cache_read_input_tokens: 30253, cache_creation_input_tokens: 13359 },
      },
    }),
    JSON.stringify({
      type: "assistant",
      message: {
        model: "claude-sonnet-5",
        usage: { input_tokens: 2, output_tokens: 456, cache_read_input_tokens: 43612, cache_creation_input_tokens: 32 },
      },
    }),
  ])

  const line = stripAnsi(
    runRenderer({
      session_id: "sess-real",
      transcript_path: transcript,
      model: { display_name: "Sonnet 5" },
      cost: { total_cost_usd: 0.52 },
    }),
  )

  assert.match(line, /in 4/)
  assert.match(line, /out 476/)
  assert.match(line, /cache 73\.9k\/13\.4k/)
  assert.match(line, /\$0\.52/)
})

test("handles missing session data without throwing", () => {
  const line = stripAnsi(runRenderer({}))
  assert.match(line, /in 0/)
  assert.match(line, /\$0/)
})

test("caches totals across runs and stays stable", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ccs-"))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))

  const transcript = writeTranscript(dir, [
    JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 1500, output_tokens: 300, cache_read_input_tokens: 100, cache_creation_input_tokens: 50 } } }),
  ])

  const payload = { session_id: "sess-3", transcript_path: transcript, model: { display_name: "Sonnet" }, cost: { total_cost_usd: 0.1 } }
  const first = stripAnsi(runRenderer(payload))
  const second = stripAnsi(runRenderer(payload))

  assert.equal(first, second)
  assert.match(first, /in 1\.5k/)
})

test("render emits a second nudge line when context is critically high", () => {
  const lines = stripAnsi(
    runRenderer({ context_window: { used_percentage: 96 }, model: { display_name: "Sonnet" } }),
  ).split("\n")

  assert.equal(lines.length, 2)
  assert.match(lines[0], /\[Sonnet\]/)
  assert.match(lines[1], /context 96% used — start a new session or \/compact/)
})

test("render stays single-line when no nudge fires", () => {
  const out = stripAnsi(runRenderer({ context_window: { used_percentage: 10 }, cost: { total_duration_ms: 60_000 } }))
  assert.equal(out.split("\n").length, 1)
  assert.match(out, /in 0/)
})

test("nudge warns on context percentage and falls back to /compact", () => {
  const hint = nudge({ context_window: { used_percentage: 88 } }, {}, EMPTY_PATHS)
  assert.equal(hint.severity, "warn")
  assert.match(hint.text, /context 88% used — consider \/compact or a new session/)
})

test("nudge is null under thresholds", () => {
  const hint = nudge(
    { context_window: { used_percentage: 50 }, cost: { total_duration_ms: 60_000 }, rate_limits: { five_hour: { used_percentage: 40 } } },
    {},
    EMPTY_PATHS,
  )
  assert.equal(hint, null)
})

test("nudge flags long-running sessions from wall-clock duration", () => {
  const warn = nudge({ cost: { total_duration_ms: 3 * 3_600_000 } }, {}, EMPTY_PATHS)
  assert.equal(warn.severity, "warn")
  assert.match(warn.text, /session open 3h — consider closing it/)

  const crit = nudge({ cost: { total_duration_ms: 5 * 3_600_000 } }, {}, EMPTY_PATHS)
  assert.equal(crit.severity, "crit")
  assert.match(crit.text, /session open 5h — consider closing it/)
})

test("nudge flags five-hour rate limit usage", () => {
  const hint = nudge({ rate_limits: { five_hour: { used_percentage: 82 } } }, {}, EMPTY_PATHS)
  assert.equal(hint.severity, "warn")
  assert.match(hint.text, /82% of 5h rate limit used/)
})

test("nudge priority: critical context beats age warn", () => {
  const hint = nudge(
    { context_window: { used_percentage: 96 }, cost: { total_duration_ms: 3 * 3_600_000 } },
    {},
    EMPTY_PATHS,
  )
  assert.equal(hint.severity, "crit")
  assert.match(hint.text, /context 96%/)
})

test("nudge appends a detected skill suggestion when context is high", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ccs-skills-"))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  writeSkill(dir, "compact-context", "Compacts the conversation context to keep sessions lean.")

  const hint = nudge({ context_window: { used_percentage: 90 } }, {}, { home: "", cwd: "", envDir: dir })
  assert.match(hint.text, /— try compact-context/)
})

test("nudge omits skill hint when none match", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ccs-skills-"))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  writeSkill(dir, "pr-review", "Reviews the current branch's changes.")

  const hint = nudge({ context_window: { used_percentage: 90 } }, {}, { home: "", cwd: "", envDir: dir })
  assert.doesNotMatch(hint.text, /try /)
})

test("nudge respects CLAUDE_TS_SKILLS=0 opt-out", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ccs-skills-"))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  writeSkill(dir, "compact-context", "Compacts the conversation context to keep sessions lean.")

  const hint = nudge({ context_window: { used_percentage: 90 } }, { CLAUDE_TS_SKILLS: "0" }, { home: "", cwd: "", envDir: dir })
  assert.doesNotMatch(hint.text, /try /)
})

test("nudge honors env var thresholds", () => {
  const hint = nudge(
    { context_window: { used_percentage: 60 } },
    { CLAUDE_TS_CONTEXT_WARN: "50" },
    EMPTY_PATHS,
  )
  assert.equal(hint.severity, "warn")
  assert.match(hint.text, /context 60%/)
})

test("line 1 shows a persistent ctx percentage", () => {
  const line = stripAnsi(
    runRenderer({ context_window: { used_percentage: 12 }, model: { display_name: "Sonnet" } }),
  )
  assert.match(line, /\[Sonnet\].*ctx 12%/)
})

test("ctx segment is color-coded by severity", () => {
  const warn = runRenderer({ context_window: { used_percentage: 88 } })
  const crit = runRenderer({ context_window: { used_percentage: 96 } })
  const ok = runRenderer({ context_window: { used_percentage: 40 } })

  assert.match(stripAnsi(warn), /ctx 88%/)
  assert.match(warn, /\x1b\[33m88%/)
  assert.match(crit, /\x1b\[31m96%/)
  assert.doesNotMatch(ok, /ctx 40%\x1b\[33m/)
})

test("ctx segment omitted when used_percentage is null", () => {
  const line = stripAnsi(
    runRenderer({ context_window: { used_percentage: null }, model: { display_name: "Sonnet" } }),
  )
  assert.doesNotMatch(line, /ctx/)
})

test("ctx segment honors NO_COLOR", () => {
  const out = runRenderer({ context_window: { used_percentage: 96 } }, { NO_COLOR: "1" })
  assert.match(out, /ctx 96%/)
  assert.equal(out.includes("\x1b["), false)
})

test("age segment shows session duration when >= 1m", () => {
  const line = stripAnsi(
    runRenderer({ cost: { total_duration_ms: 5_400_000 } }),
  )
  assert.match(line, /age 1h 30m/)

  const hidden = stripAnsi(runRenderer({ cost: { total_duration_ms: 30_000 } }))
  assert.doesNotMatch(hidden, /age/)
})

test("model display name strips the context-size suffix", () => {
  const line = stripAnsi(
    runRenderer({ model: { display_name: "Sonnet 5 (200k context)" } }),
  )
  assert.match(line, /\[Sonnet 5\]/)
  assert.doesNotMatch(line, /200k/)
})

test("effort segment shows when present and hides when absent", () => {
  const withEffort = stripAnsi(runRenderer({ effort: { level: "high" } }))
  assert.match(withEffort, /effort high/)

  const withoutEffort = stripAnsi(runRenderer({}))
  assert.doesNotMatch(withoutEffort, /effort/)
})

test("folder segment shows the basename of the working directory", () => {
  const line = stripAnsi(
    runRenderer({ cwd: "/Users/you/projects/my-app" }),
  )
  assert.match(line, /my-app/)
})

test("git segment appears only when CLAUDE_TS_GIT=1 and cwd is a repo", (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "ccs-repo-"))
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }))

  const git = spawnSync("git", ["init", "--quiet", "-b", "main"], { cwd: repo })
  assert.equal(git.status, 0, "git init should succeed")

  spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: repo })
  spawnSync("git", ["config", "user.name", "Test"], { cwd: repo })
  const commit = spawnSync("git", ["commit", "--quiet", "--allow-empty", "-m", "init"], { cwd: repo })
  assert.equal(commit.status, 0, "initial commit should succeed")

  const on = stripAnsi(
    runRenderer({ cwd: repo }, { CLAUDE_TS_GIT: "1" }),
  )
  assert.match(on, /git main/)

  const off = stripAnsi(runRenderer({ cwd: repo }))
  assert.doesNotMatch(off, /git main/)

  const notRepo = fs.mkdtempSync(path.join(os.tmpdir(), "ccs-norepo-"))
  t.after(() => fs.rmSync(notRepo, { recursive: true, force: true }))
  const missing = stripAnsi(
    runRenderer({ cwd: notRepo }, { CLAUDE_TS_GIT: "1" }),
  )
  assert.doesNotMatch(missing, /git /)
})

test("skills segment shows a count and hides when none exist", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ccs-skills-home-"))
  t.after(() => fs.rmSync(home, { recursive: true, force: true }))
  writeSkill(path.join(home, ".claude", "skills"), "compact-context", "Compacts the conversation context.")

  const withSkills = stripAnsi(runRenderer({}, { HOME: home }))
  assert.match(withSkills, /skills 1/)

  const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), "ccs-noskills-"))
  t.after(() => fs.rmSync(emptyHome, { recursive: true, force: true }))
  const withoutSkills = stripAnsi(runRenderer({}, { HOME: emptyHome }))
  assert.doesNotMatch(withoutSkills, /skills/)
})

test("ctx segment includes a severity-colored progress bar", () => {
  const warn = runRenderer({ context_window: { used_percentage: 88 } })
  assert.match(stripAnsi(warn), /ctx 88% \[█████░\]/)
  assert.match(warn, /\x1b\[33m\[█████░\]/)

  const crit = runRenderer({ context_window: { used_percentage: 96 } })
  assert.match(stripAnsi(crit), /ctx 96% \[██████\]/)
  assert.match(crit, /\x1b\[31m\[██████\]/)

  const ok = runRenderer({ context_window: { used_percentage: 10 } })
  assert.match(stripAnsi(ok), /ctx 10% \[█░░░░░\]/)
  assert.match(ok, /\x1b\[32m\[█░░░░░\]/)
})

test("ctx bar is omitted when used_percentage is null", () => {
  const out = stripAnsi(runRenderer({ context_window: { used_percentage: null } }))
  assert.doesNotMatch(out, /ctx/)
  assert.doesNotMatch(out, /█/)
})

test("in is cyan and out is magenta", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ccs-colors-"))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const transcript = writeTranscript(dir, [
    JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 1000, output_tokens: 500 } } }),
  ])
  const out = runRenderer({ session_id: "sess-color", transcript_path: transcript })
  assert.match(out, /\x1b\[36m1\.0k\x1b\[0m/)   // in = cyan
  assert.match(out, /\x1b\[35m500\x1b\[0m/)     // out = magenta
})

test("cost is tiered by amount", () => {
  const cheap = runRenderer({ cost: { total_cost_usd: 1 } })
  assert.match(cheap, /\x1b\[1m\x1b\[32m\$1\.00\x1b\[0m/) // green < $5

  const mid = runRenderer({ cost: { total_cost_usd: 12 } })
  assert.match(mid, /\x1b\[1m\x1b\[33m\$12\.00\x1b\[0m/) // yellow < $20

  const dear = runRenderer({ cost: { total_cost_usd: 25 } })
  assert.match(dear, /\x1b\[1m\x1b\[31m\$25\.00\x1b\[0m/) // red >= $20
})

test("model gets a chip background", () => {
  const out = runRenderer({ model: { display_name: "Sonnet 5" } })
  assert.match(out, /\x1b\[100m\x1b\[97m\[Sonnet 5\]\x1b\[0m/)
})

test("nudge row uses a warning banner background", () => {
  const warn = runRenderer({ context_window: { used_percentage: 88 } })
  assert.match(warn, /\n\x1b\[43m\x1b\[30mcontext 88% used — consider \/compact or a new session\x1b\[0m$/)

  const crit = runRenderer({ context_window: { used_percentage: 96 } })
  assert.match(crit, /\n\x1b\[41m\x1b\[97mcontext 96% used — start a new session or \/compact\x1b\[0m$/)
})

test("NO_COLOR strips chip, banner, and bar colors", () => {
  const out = runRenderer(
    { context_window: { used_percentage: 96 }, model: { display_name: "Sonnet 5" }, cost: { total_cost_usd: 25 } },
    { NO_COLOR: "1" },
  )
  assert.equal(out.includes("\x1b["), false)
  assert.match(out, /\[Sonnet 5\]/)
  assert.match(out, /ctx 96% \[██████\]/)
  assert.match(out, /\$25\.00/)
})
