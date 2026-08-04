# Contributing

Thanks for wanting to help improve `claude-statusbar`!

## Setup

```bash
npm ci
```

## Commands

- `npm run typecheck` — strict TypeScript check (JSDoc-typed JS, `checkJs`)
- `npm test` — Node test runner (`node --test`)
- `npm run build` — runs the typecheck (there is no bundling step)

## Before you open a PR

1. Run `npm run typecheck` and `npm test` — both must pass.
2. Keep the package **dependency-free at runtime** — the whole point of the
   statusline script is that it runs instantly, every message, with zero npm
   dependencies. Adding a runtime dependency needs a strong justification.
3. If you change rendering, run `node bin/claude-statusbar.mjs test` to confirm
   the sample line still looks right.
4. Update the README if user-facing behavior changed.

## Adding tests

Tests live in `test/` as `.test.mjs` files using the built-in `node:test` runner.
The renderer is exercised by spawning `src/statusline.mjs` with a JSON payload on
stdin against a throwaway transcript in a temp dir.

## Release process

Maintainers only. After merging, tag a release in GitHub with a `v*` tag; the
`release.yml` workflow runs typecheck + tests and publishes to npm with
provenance (requires an `NPM_TOKEN` repo secret).
