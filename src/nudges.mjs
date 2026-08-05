import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const HOUR_MS = 3_600_000

/**
 * @param {string | undefined} value
 * @param {number} fallback
 * @returns {number}
 */
function parseDurationMs(value, fallback) {
  if (value == null || value === "") return fallback
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(String(value).trim())
  if (!m) return fallback
  const n = Number(m[1])
  const unit = m[2] ?? "ms"
  const mult = { ms: 1, s: 1000, m: 60_000, h: HOUR_MS }[unit] ?? 1
  return n * mult
}

/**
 * @param {string | undefined} value
 * @param {number} fallback
 * @returns {number}
 */
export function envNum(value, fallback) {
  if (value == null || value === "") return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** @param {number} ms @returns {string} */
export function fmtDuration(ms) {
  const totalMin = Math.floor(ms / 60_000)
  if (totalMin >= 60) {
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    return m ? `${h}h ${m}m` : `${h}h`
  }
  return `${totalMin}m`
}

/**
 * @param {{ home?: string, cwd?: string, envDir?: string }} paths
 * @returns {{ name: string, text: string }[]}
 */
function detectSkills(paths) {
  const dirs = []
  if (paths.envDir) {
    dirs.push(paths.envDir)
  } else {
    if (paths.home) dirs.push(path.join(paths.home, ".claude", "skills"))
    if (paths.cwd) dirs.push(path.join(paths.cwd, ".claude", "skills"))
  }
  const skills = []
  for (const dir of dirs) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      let content
      try {
        content = fs.readFileSync(path.join(dir, entry.name, "SKILL.md"), "utf8")
      } catch {
        continue
      }
      const name = /^name:\s*(.+?)\s*$/m.exec(content)?.[1]?.trim() ?? entry.name
      const description = /^description:\s*(.+?)\s*$/m.exec(content)?.[1]?.trim() ?? ""
      skills.push({ name, text: `${name} ${description}`.toLowerCase() })
    }
  }
  return skills
}

/**
 * Count installed skills across the user and project skill directories.
 *
 * @param {{ home?: string, cwd?: string, envDir?: string }} paths
 * @returns {number}
 */
export function countSkills(paths) {
  return detectSkills(paths).length
}

/**
 * @param {{ name: string, text: string }[]} skills
 * @param {string[]} intent
 * @returns {string | null}
 */
function suggestSkill(skills, intent) {
  for (const keyword of intent) {
    const match = skills.find((s) => s.text.includes(keyword))
    if (match) return match.name
  }
  return null
}

/**
 * Classify context usage against the configured thresholds.
 *
 * @param {number | undefined} usedPct
 * @param {Record<string, string | undefined>} [env]
 * @returns {"ok" | "warn" | "crit"}
 */
export function contextLevel(usedPct, env = process.env) {
  const contextWarn = envNum(env.CLAUDE_TS_CONTEXT_WARN, 85)
  const contextCrit = envNum(env.CLAUDE_TS_CONTEXT_CRIT, 95)
  if (typeof usedPct !== "number") return "ok"
  if (usedPct >= contextCrit) return "crit"
  if (usedPct >= contextWarn) return "warn"
  return "ok"
}

/**
 * Decide whether to nudge the user toward a fresh session or /compact.
 *
 * @param {any} data - The status line stdin payload.
 * @param {Record<string, string | undefined>} [env]
 * @param {{ home?: string, cwd?: string, envDir?: string }} [paths]
 * @returns {{ severity: "warn" | "crit", text: string } | null}
 */
export function nudge(data, env = process.env, paths = { home: os.homedir(), cwd: process.cwd() }) {
  const rateWarn = envNum(env.CLAUDE_TS_RATE_WARN, 80)
  const ageWarn = parseDurationMs(env.CLAUDE_TS_AGE_WARN, 2 * HOUR_MS)
  const ageCrit = parseDurationMs(env.CLAUDE_TS_AGE_CRIT, 4 * HOUR_MS)

  /** @type {{ severity: "warn" | "crit", order: number, text: string, context?: boolean }[]} */
  const candidates = []

  const usedPct = data?.context_window?.used_percentage
  const level = contextLevel(usedPct, env)
  if (typeof usedPct === "number") {
    const pct = Math.round(usedPct)
    if (level === "crit") {
      candidates.push({ severity: "crit", order: 1, text: `context ${pct}% used — start a new session or /compact`, context: true })
    } else if (level === "warn") {
      candidates.push({ severity: "warn", order: 1, text: `context ${pct}% used — consider /compact or a new session`, context: true })
    }
  }

  const fiveHourPct = data?.rate_limits?.five_hour?.used_percentage
  if (typeof fiveHourPct === "number" && fiveHourPct >= rateWarn) {
    candidates.push({ severity: "warn", order: 2, text: `${Math.round(fiveHourPct)}% of 5h rate limit used` })
  }

  const durationMs = data?.cost?.total_duration_ms
  if (typeof durationMs === "number" && durationMs > 0) {
    const dur = fmtDuration(durationMs)
    if (durationMs >= ageCrit) {
      candidates.push({ severity: "crit", order: 3, text: `session open ${dur} — consider closing it` })
    } else if (durationMs >= ageWarn) {
      candidates.push({ severity: "warn", order: 3, text: `session open ${dur} — consider closing it` })
    }
  }

  if (candidates.length === 0) return null

  candidates.sort((a, b) => {
    const sa = a.severity === "crit" ? 0 : 1
    const sb = b.severity === "crit" ? 0 : 1
    if (sa !== sb) return sa - sb
    return a.order - b.order
  })
  const top = candidates[0]

  if (top.context && env.CLAUDE_TS_SKILLS !== "0") {
    const skills = detectSkills(paths)
    const intent = top.severity === "crit"
      ? ["compact", "context", "session", "clean", "memory", "summar", "handoff"]
      : ["compact", "context", "clean", "session"]
    const skill = suggestSkill(skills, intent)
    if (skill) top.text += ` — try ${skill}`
  }

  return { severity: top.severity, text: top.text }
}
