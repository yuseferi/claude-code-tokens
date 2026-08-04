import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

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

test("formats and sums a transcript into a status line", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ccs-"))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))

  const transcript = writeTranscript(dir, [
    JSON.stringify({ type: "user", message: { role: "user", content: "hi" } }),
    JSON.stringify({
      type: "assistant",
      usage: { input_tokens: 12300, output_tokens: 4500, cache_read_input_tokens: 8200, cache_creation_input_tokens: 1000 },
    }),
    JSON.stringify({
      type: "assistant",
      usage: { input_tokens: 200, output_tokens: 100, cache_read_input_tokens: 50, cache_creation_input_tokens: 10 },
      costUSD: 0.005,
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
    JSON.stringify({ type: "assistant", usage: { input_tokens: 1000, output_tokens: 100 }, costUSD: 0.123 }),
  ])

  const line = stripAnsi(
    runRenderer({ session_id: "sess-2", transcript_path: transcript, model: { display_name: "Opus" } }),
  )

  assert.match(line, /\$0\.12/)
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
    JSON.stringify({ type: "assistant", usage: { input_tokens: 1500, output_tokens: 300, cache_read_input_tokens: 100, cache_creation_input_tokens: 50 } }),
  ])

  const payload = { session_id: "sess-3", transcript_path: transcript, model: { display_name: "Sonnet" }, cost: { total_cost_usd: 0.1 } }
  const first = stripAnsi(runRenderer(payload))
  const second = stripAnsi(runRenderer(payload))

  assert.equal(first, second)
  assert.match(first, /in 1\.5k/)
})
