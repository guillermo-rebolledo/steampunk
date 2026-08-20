# steampunk

Agent configuration for this repo lives in [CLAUDE.md](./CLAUDE.md) — see its
`## Agent skills` section for the issue tracker, triage labels and domain docs.

The underlying config files are:

- `docs/agents/issue-tracker.md` — issues live in Linear (team `MEM`), not GitHub Issues
- `docs/agents/triage-labels.md` — the five canonical triage labels
- `docs/agents/domain.md` — single-context domain docs (`CONTEXT.md` + `docs/adr/`)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
