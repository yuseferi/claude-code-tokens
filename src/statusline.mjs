import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { contextLevel, countSkills, envNum, fmtDuration, nudge } from "./nudges.mjs"

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
const MAGENTA = "\x1b[35m"
const CYAN = "\x1b[36m"
const BRIGHT_WHITE = "\x1b[97m"
const CHIP_BG = "\x1b[100m"
const BANNER_WARN = "\x1b[43m\x1b[30m" // yellow bg + black text
const BANNER_CRIT = "\x1b[41m\x1b[97m" // red bg + white text
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

const GIT_CACHE = path.join(os.tmpdir(), "claude-token-statusbar-git.json")
const SKILLS_CACHE = path.join(os.tmpdir(), "claude-token-statusbar-skills.json")

/** @param {string} file @returns {Record<string, any>} */
function readCache(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch {
    return {}
  }
}

/** @param {string} file @param {Record<string, any>} cache */
function writeCache(file, cache) {
  try {
    fs.writeFileSync(file, JSON.stringify(cache))
  } catch {
    // cache is best-effort
  }
}

/**
 * Current git branch for a working directory, cached across refreshes.
 *
 * @param {string} cwd
 * @returns {string} empty string when not a git repo / detached / git missing
 */
function gitBranch(cwd) {
  const ttlMs = envNum(process.env.CLAUDE_TS_GIT_TTL, 30) * 1000
  const cache = readCache(GIT_CACHE)
  const entry = cache[cwd]
  if (entry && Date.now() - entry.ts < ttlMs) return entry.branch

  let branch = ""
  try {
    const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      encoding: "utf8",
      timeout: 1000,
    })
    if (result.status === 0 && result.stdout && result.stdout.trim() !== "HEAD") {
      branch = result.stdout.trim()
    }
  } catch {
    // not a repo / git missing
  }

  const pruned = Object.fromEntries(
    Object.entries(cache).filter(([, value]) => Date.now() - value.ts < ttlMs),
  )
  pruned[cwd] = { branch, ts: Date.now() }
  writeCache(GIT_CACHE, pruned)
  return branch
}

/**
 * Skill count for a set of scan directories, cached across refreshes.
 *
 * @param {{ home: string, cwd?: string }} paths
 * @returns {number}
 */
function skillCount(paths) {
  const ttlMs = 30_000
  const key = JSON.stringify(paths)
  const cache = readCache(SKILLS_CACHE)
  const entry = cache[key]
  if (entry && Date.now() - entry.ts < ttlMs) return entry.count

  const count = countSkills(paths)
  const pruned = Object.fromEntries(
    Object.entries(cache).filter(([, value]) => Date.now() - value.ts < ttlMs),
  )
  pruned[key] = { count, ts: Date.now() }
  writeCache(SKILLS_CACHE, pruned)
  return count
}

/** $ thresholds: cost below COST_WARN is green, below COST_CRIT is yellow, else red. */
const COST_WARN = 5
const COST_CRIT = 20

/** @param {number} value @returns {string} */
function costColor(value) {
  if (value >= COST_CRIT) return RED
  if (value >= COST_WARN) return YELLOW
  return GREEN
}

/** ctx bar width in cells */
const BAR_CELLS = 6

/**
 * @param {number} pct
 * @returns {string} e.g. "[████░░]"
 */
function ctxBar(pct) {
  const filled = Math.max(0, Math.min(BAR_CELLS, Math.round((pct / 100) * BAR_CELLS)))
  return `[${"█".repeat(filled)}${"░".repeat(BAR_CELLS - filled)}]`
}

/**
 * @param {string | undefined} displayName
 * @returns {string}
 */
function cleanModel(displayName) {
  return (displayName ?? "")
    .replace(/\s+\(\d+[kKmM]? context\)$/, "")
    .replace(/\s+\d+[kKmM]? context$/, "")
    .trim()
}

/**
 * @param {any} data
 * @returns {string}
 */
export function render(data) {
  const model = cleanModel(data?.model?.display_name)
  const sessionId = data?.session_id
  const transcriptPath = data?.transcript_path
  const workdir = data?.workspace?.current_dir || data?.cwd

  const totals = transcriptTotals(sessionId, transcriptPath)

  let cost = data?.cost?.total_cost_usd ?? 0
  if (cost == null || Number.isNaN(cost)) cost = 0
  if (cost === 0 && totals.cost > 0) cost = totals.cost

  const parts = []
  /** @param {string} label @param {string} value */
  const seg = (label, value) => parts.push(`${noColor ? "" : DIM}${label}${noColor ? "" : RESET} ${value}`)

  if (workdir) {
    const folder = path.basename(workdir)
    if (folder) parts.push(`${noColor ? "" : CYAN}${folder}${noColor ? "" : RESET}`)
  }

  const effort = data?.effort?.level
  if (effort) seg("effort", `${noColor ? "" : CYAN}${effort}${noColor ? "" : RESET}`)

  if (workdir && envNum(process.env.CLAUDE_TS_GIT, 0) === 1) {
    const branch = gitBranch(workdir)
    if (branch) seg("git", `${noColor ? "" : CYAN}${branch}${noColor ? "" : RESET}`)
  }

  seg("in", `${noColor ? "" : CYAN}${fmtTokens(totals.input)}${noColor ? "" : RESET}`)
  seg("out", `${noColor ? "" : MAGENTA}${fmtTokens(totals.output)}${noColor ? "" : RESET}`)
  if (totals.cacheRead > 0 || totals.cacheWrite > 0) {
    seg("cache", `${fmtTokens(totals.cacheRead)}/${fmtTokens(totals.cacheWrite)}`)
  }
  const usedPct = data?.context_window?.used_percentage
  if (typeof usedPct === "number") {
    const pct = Math.round(usedPct)
    const level = contextLevel(usedPct)
    const ctxColor = noColor ? "" : level === "crit" ? RED : level === "warn" ? YELLOW : GREEN
    const ctxReset = noColor ? "" : RESET
    seg("ctx", `${ctxColor}${pct}%${ctxReset} ${ctxColor}${ctxBar(usedPct)}${ctxReset}`)
  }
  const durationMs = data?.cost?.total_duration_ms
  if (typeof durationMs === "number" && durationMs >= 60_000) {
    seg("age", fmtDuration(durationMs))
  }
  const skills = skillCount({ home: os.homedir(), cwd: workdir })
  if (skills > 0) seg("skills", String(skills))
  const costClr = noColor ? "" : costColor(cost)
  parts.push(`${noColor ? "" : BOLD}${costClr}${fmtCost(cost)}${noColor ? "" : RESET}`)

  let line = parts.join("  ")
  if (model) line = `${noColor ? "" : CHIP_BG}${noColor ? "" : BRIGHT_WHITE}[${model}]${noColor ? "" : RESET}  ${line}`

  const hint = nudge(data)
  if (!hint) return line

  const banner = noColor ? "" : hint.severity === "crit" ? BANNER_CRIT : BANNER_WARN
  const unpaint = noColor ? "" : RESET
  return `${line}\n${banner}${hint.text}${unpaint}`
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
