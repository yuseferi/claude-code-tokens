import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { render } from "./statusline.mjs"

const SCRIPT_FILENAME = "statusline.mjs"
const PACKAGE_DIR = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT_SOURCE = path.join(PACKAGE_DIR, "statusline.mjs")
const SCRIPT_DEST = () => path.join(os.homedir(), ".claude", SCRIPT_FILENAME)
const DEFAULT_REFRESH_INTERVAL = 1

/** @param {"user" | "project"} scope @returns {string} */
function settingsPath(scope) {
  return scope === "project"
    ? path.join(process.cwd(), ".claude", "settings.json")
    : path.join(os.homedir(), ".claude", "settings.json")
}

/**
 * @param {string} file
 * @returns {any}
 */
function readSettings(file) {
  if (!fs.existsSync(file)) return {}
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch {
    throw new Error(`Cannot parse ${file} — it must be valid JSON.`)
  }
}

/**
 * @param {string} file
 * @param {any} settings
 */
function writeSettings(file, settings) {
  fs.writeFileSync(file, JSON.stringify(settings, null, 2) + "\n")
}

/**
 * @param {string} file
 * @returns {string}
 */
function writeBackup(file) {
  const backup = `${file}.bak`
  if (fs.existsSync(file) && !fs.existsSync(backup)) {
    fs.copyFileSync(file, backup)
  }
  return backup
}

/**
 * @param {"user" | "project"} scope
 * @returns {{ changed: boolean, message: string }}
 */
export function install(scope) {
  const settingsFile = settingsPath(scope)
  const settings = readSettings(settingsFile)

  const claudeDir = path.dirname(settingsFile)
  fs.mkdirSync(claudeDir, { recursive: true })
  fs.copyFileSync(SCRIPT_SOURCE, SCRIPT_DEST())

  if (settings.statusLine) {
    return {
      changed: false,
      message:
        `Refreshed status line script → ${SCRIPT_DEST()}\n` +
        `statusLine already configured in ${settingsFile}. No changes made.`,
    }
  }

  const backup = writeBackup(settingsFile)
  settings.statusLine = {
    type: "command",
    command: `node ${SCRIPT_DEST()}`,
    refreshInterval: DEFAULT_REFRESH_INTERVAL,
  }
  writeSettings(settingsFile, settings)

  return {
    changed: true,
    message:
      `Installed status line → ${SCRIPT_DEST()}\n` +
      `Updated ${settingsFile}${backup ? ` (backup: ${backup})` : ""}\n` +
      `Restart claude (or start a new session) to see it.`,
  }
}

/**
 * @param {"user" | "project"} scope
 * @returns {{ changed: boolean, message: string }}
 */
export function uninstall(scope) {
  const settingsFile = settingsPath(scope)
  if (!fs.existsSync(settingsFile)) {
    return { changed: false, message: `No settings file at ${settingsFile}.` }
  }
  const settings = readSettings(settingsFile)
  const hadStatusLine = Boolean(settings.statusLine)
  if (hadStatusLine) {
    delete settings.statusLine
    writeSettings(settingsFile, settings)
  }
  if (fs.existsSync(SCRIPT_DEST())) {
    fs.rmSync(SCRIPT_DEST())
  }
  return {
    changed: hadStatusLine,
    message: hadStatusLine
      ? `Removed statusLine from ${settingsFile} and deleted ${SCRIPT_DEST()}.`
      : `No statusLine configured at ${settingsFile}.`,
  }
}

export function runTest() {
  const payload = {
    cwd: "/Users/you/projects/my-app",
    session_id: "test-session-0001",
    transcript_path: os.devNull,
    model: { id: "claude-sonnet-5", display_name: "Sonnet" },
    cost: { total_cost_usd: 0.42, total_duration_ms: 5_400_000 },
    context_window: {
      total_input_tokens: 15500,
      total_output_tokens: 1200,
      used_percentage: 92,
      current_usage: {
        input_tokens: 8500,
        output_tokens: 1200,
        cache_creation_input_tokens: 5000,
        cache_read_input_tokens: 2000,
      },
    },
  }
  for (const line of render(payload).split("\n")) process.stdout.write(line + "\n")
}
