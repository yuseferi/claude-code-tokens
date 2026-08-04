import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

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
const RESET = "\x1b[0m"

/**
 * @param {string} sessionId
 * @returns {string}
 */
const cachePath = (sessionId) =>
  path.join(os.tmpdir(), `claude-token-statusbar-${sessionId}.json`)

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
    if (entry.usage) {
      totals.input += entry.usage.input_tokens ?? 0
      totals.output += entry.usage.output_tokens ?? 0
      totals.cacheRead += entry.usage.cache_read_input_tokens ?? 0
      totals.cacheWrite += entry.usage.cache_creation_input_tokens ?? 0
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
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached
  }
  const totals = parseTranscript(transcriptPath)
  try {
    fs.writeFileSync(file, JSON.stringify({ ...totals, mtimeMs: stat.mtimeMs, size: stat.size }))
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
  const seg = (label, value) => parts.push(`${DIM}${label}${RESET} ${value}`)
  seg("in", fmtTokens(totals.input))
  seg("out", fmtTokens(totals.output))
  if (totals.cacheRead > 0 || totals.cacheWrite > 0) {
    seg("cache", `${fmtTokens(totals.cacheRead)}/${fmtTokens(totals.cacheWrite)}`)
  }
  parts.push(`${GREEN}${BOLD}${fmtCost(cost)}${RESET}`)

  let line = parts.join("  ")
  if (model) line = `${DIM}[${model}]${RESET}  ${line}`
  return line
}

async function main() {
  try {
    const raw = await readStdin()
    if (!raw.trim()) return
    const data = JSON.parse(raw)
    process.stdout.write(render(data) + "\n")
  } catch {
    // A status line must never throw or print noise to the TUI.
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
