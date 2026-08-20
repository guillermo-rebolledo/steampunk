# Issue tracker: Linear

Issues, tickets and PRDs for this repo live in **Linear**, workspace `memoji-inc`,
team **MEM** ("Memoji Inc", id `56e68145-9162-4e1e-9347-4c0ddcc65992`).
Board: https://linear.app/memoji-inc/team/MEM

Code, branches and PRs live in GitHub (`guillermo-rebolledo/steampunk`). The two are
separate surfaces: **never** run `gh issue create` for this repo — issues go to Linear.

## Access

Use the **Linear MCP tools** (`mcp__claude_ai_Linear__*`). Their schemas are deferred —
load them on demand first, e.g.
`ToolSearch("select:mcp__claude_ai_Linear__save_issue,mcp__claude_ai_Linear__get_issue")`.

If the Linear MCP server is unavailable in a given session (headless/cron runs may not
have it), say so and stop rather than falling back to GitHub issues.

## Conventions

| Operation | Tool |
| --- | --- |
| Create an issue | `save_issue` with `team: "MEM"`, `title`, `description` (Markdown, literal newlines) — omit `id` |
| Update an issue | `save_issue` with `id: "MEM-123"`; prefer `patch` over resending `description` |
| Read an issue | `get_issue` (`MEM-123`), plus `list_comments` for the thread |
| List issues | `list_issues` with `team: "MEM"`, filtered by `label`, `state`, or `assignee` |
| Comment | `save_comment` with `issueId: "MEM-123"` and `body` |
| Apply labels | `save_issue` with `labels: [...]` — **replaces the whole set**, so read current labels first and re-send the ones you're keeping |
| Close | `save_issue` with `state: "Done"` (or `"Canceled"` for wontfix) |
| Assign to self | `save_issue` with `assignee: "me"` |

## Workflow states

`Backlog` · `Todo` · `In Progress` · `In Review` · `Done` · `Canceled` · `Duplicate`

Triage labels are orthogonal to these — see `docs/agents/triage-labels.md`.

## When a skill says "publish to the issue tracker"

Create a Linear issue on team `MEM`. Report back the returned identifier (`MEM-123`)
and URL, not just the title.

## When a skill says "fetch the relevant ticket"

`get_issue` for the body, then `list_comments` for the discussion.

## Specs and PRDs

Longer-form documents (the output of `/to-spec`, PRDs, research write-ups) go to
**Linear documents** on the team, not issue bodies:
`save_document` with `team: "MEM"`, `title`, `content`.
Read them back with `list_documents` / `get_document`.
Link the document to its driving issue with `save_issue`'s `links: [{url, title}]`.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(This repo's PRs are on GitHub and are not part of
the Linear triage queue. Flip to `yes` only if you start treating external GitHub PRs
as incoming requests; `/triage` reads this flag.)_

## Wayfinding operations

Used by `/wayfinder`. The **map** is a parent issue; **tickets** are its sub-issues.

- **Map**: an issue on `MEM` holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: `save_issue` with `parentId: "MEM-<map>"`. Type goes in the title
  prefix (`research:` / `prototype:` / `grilling:` / `task:`).
- **Blocking**: native Linear relations — `save_issue` with `blockedBy: ["MEM-7"]`
  (append-only; `removeBlockedBy` to clear). A ticket is unblocked when every blocker
  is `Done` or `Canceled`.
- **Frontier query**: `list_issues` with `parentId: "MEM-<map>"`, `fields` including
  `status`, `assignee`, `parentId`; drop anything already assigned or with an open
  blocker; first in map order wins.
- **Claim**: `save_issue` with `assignee: "me"` — the session's first write.
- **Resolve**: `save_comment` with the answer, `save_issue` to `state: "Done"`, then
  append a context pointer to the map's Decisions-so-far via `patch`.
