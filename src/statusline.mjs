import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { contextLevel, nudge } from "./nudges.mjs"

/** @param {number} value @returns {string} */
const fmtTokens = (value) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return `${value}`
}

/** @param {number} value @returns {string} */
const fmtCost = (value) => {
  if (!value) return "$0"
  if (value < 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

const DIM = "\x1b[90m"
const BOLD = "\x1b[1m"
const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"
const RED = "\x1b[31m"
const RESET = "\x1b[0m"

const noColor = typeof process.env.NO_COLOR !== "undefined" && process.env.NO_COLOR !== ""

/**
 * @param {string} sessionId
 * @returns {string}
 */
const cachePath = (sessionId) =>
  path.join(os.tmpdir(), `claude-token-statusbar-${sessionId}.json`)

/** Bump when the cache schema changes to invalidate stale entries. */
const CACHE_VERSION = 2

/** @returns {Promise<string>} */
function readStdin() {
  return new Promise((resolve) => {
    let input = ""
    if (process.stdin.isTTY) return resolve("")
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", (chunk) => (input += chunk))
    process.stdin.on("end", () => resolve(input))
    process.stdin.resume()
  })
}

/**
 * @param {string} transcriptPath
 * @returns {{ input: number, output: number, cacheRead: number, cacheWrite: number, cost: number }}
 */
function parseTranscript(transcriptPath) {
  const content = fs.readFileSync(transcriptPath, "utf8")
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 }
  for (const line of content.split("\n")) {
    if (!line.trim()) continue
    /** @type {any} */
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (entry.type !== "assistant") continue
    const usage = entry.message?.usage ?? entry.usage
    if (usage) {
      totals.input += usage.input_tokens ?? 0
      totals.output += usage.output_tokens ?? 0
      totals.cacheRead += usage.cache_read_input_tokens ?? 0
      totals.cacheWrite += usage.cache_creation_input_tokens ?? 0
    }
    totals.cost += entry.costUSD ?? 0
  }
  return totals
}

/**
 * @param {string} sessionId
 * @param {string} transcriptPath
 * @returns {any}
 */
function cachedTotals(sessionId, transcriptPath) {
  const file = cachePath(sessionId)
  const stat = fs.statSync(transcriptPath)
  let cached = null
  try {
    cached = JSON.parse(fs.readFileSync(file, "utf8"))
  } catch {
    cached = null
  }
  if (
    cached &&
    cached.version === CACHE_VERSION &&
    cached.mtimeMs === stat.mtimeMs &&
    cached.size === stat.size
  ) {
    return cached
  }
  const totals = parseTranscript(transcriptPath)
  try {
    fs.writeFileSync(
      file,
      JSON.stringify({ ...totals, version: CACHE_VERSION, mtimeMs: stat.mtimeMs, size: stat.size }),
    )
  } catch {
    // cache is best-effort
  }
  return totals
}

/**
 * @param {string | undefined} sessionId
 * @param {string | undefined} transcriptPath
 * @returns {{ input: number, output: number, cacheRead: number, cacheWrite: number, cost: number }}
 */
function transcriptTotals(sessionId, transcriptPath) {
  if (transcriptPath && sessionId) {
    try {
      return cachedTotals(sessionId, transcriptPath)
    } catch {
      // fall through to zeros
    }
  }
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 }
}

/**
 * @param {any} data
 * @returns {string}
 */
export function render(data) {
  const model = data?.model?.display_name
  const sessionId = data?.session_id
  const transcriptPath = data?.transcript_path

  const totals = transcriptTotals(sessionId, transcriptPath)

  let cost = data?.cost?.total_cost_usd ?? 0
  if (cost == null || Number.isNaN(cost)) cost = 0
  if (cost === 0 && totals.cost > 0) cost = totals.cost

  const parts = []
  /** @param {string} label @param {string} value */
  const seg = (label, value) => parts.push(`${noColor ? "" : DIM}${label}${noColor ? "" : RESET} ${value}`)
  seg("in", fmtTokens(totals.input))
  seg("out", fmtTokens(totals.output))
  if (totals.cacheRead > 0 || totals.cacheWrite > 0) {
    seg("cache", `${fmtTokens(totals.cacheRead)}/${fmtTokens(totals.cacheWrite)}`)
  }
  const usedPct = data?.context_window?.used_percentage
  if (typeof usedPct === "number") {
    const pct = Math.round(usedPct)
    const level = contextLevel(usedPct)
    const ctxColor = noColor ? "" : level === "crit" ? RED : level === "warn" ? YELLOW : ""
    const ctxReset = noColor ? "" : RESET
    seg("ctx", `${ctxColor}${pct}%${ctxReset}`)
  }
  parts.push(`${noColor ? "" : GREEN}${noColor ? "" : BOLD}${fmtCost(cost)}${noColor ? "" : RESET}`)

  let line = parts.join("  ")
  if (model) line = `${noColor ? "" : DIM}[${model}]${noColor ? "" : RESET}  ${line}`

  const hint = nudge(data)
  if (!hint) return line

  const color = hint.severity === "crit" ? RED : YELLOW
  const paint = noColor ? "" : `${BOLD}${color}`
  const unpaint = noColor ? "" : RESET
  return `${line}\n${paint}${hint.text}${unpaint}`
}

async function main() {
  try {
    const raw = await readStdin()
    if (!raw.trim()) return
    const data = JSON.parse(raw)
    const lines = render(data).split("\n")
    for (const l of lines) process.stdout.write(l + "\n")
  } catch {
    // A status line must never throw or print noise to the TUI.
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
