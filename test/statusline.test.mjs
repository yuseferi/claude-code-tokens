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

function runRenderer(payload) {
  const result = spawnSync(process.execPath, [RENDERER], {
    input: JSON.stringify(payload),
    encoding: "utf8",
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
