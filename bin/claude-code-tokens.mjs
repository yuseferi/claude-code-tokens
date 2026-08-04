#!/usr/bin/env node
import { install, uninstall, runTest } from "../src/install.mjs"

const HELP = `claude-code-tokens — reactive token & cost status line for Claude Code

Usage:
  claude-code-tokens install [--scope user|project]   Configure the status line (default: user)
  claude-code-tokens uninstall [--scope user|project] Remove the status line
  claude-code-tokens test                              Print a sample status line
  claude-code-tokens help                              Show this help

Options:
  --scope user|project   Write to ~/.claude/settings.json (default) or <cwd>/.claude/settings.json
  --dry-run              Print what would change without writing anything (install/uninstall)

Examples:
  npx claude-code-tokens@latest install
  npx claude-code-tokens@latest test
`

function parseArgs(argv) {
  const args = { scope: "user", dryRun: false }
  for (const arg of argv) {
    if (arg === "--scope") continue
    if (arg === "user" || arg === "project") {
      args.scope = arg
    } else if (arg === "--dry-run") {
      args.dryRun = true
    }
  }
  args.command = argv.find((a) => ["install", "uninstall", "test", "help"].includes(a)) ?? "help"
  return args
}

function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.dryRun && args.command !== "help") {
    console.log(`[dry-run] would run \`${args.command}\` with scope \`${args.scope}\` — no files changed.`)
    return
  }

  switch (args.command) {
    case "install": {
      const result = install(args.scope)
      console.log(result.message)
      break
    }
    case "uninstall": {
      const result = uninstall(args.scope)
      console.log(result.message)
      break
    }
    case "test":
      runTest()
      break
    case "help":
    default:
      console.log(HELP)
  }
}

main()
