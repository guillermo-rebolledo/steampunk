# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to
the actual label strings used in this repo's issue tracker (Linear team `MEM`).

All five already exist in Linear with matching names, so the mapping is 1:1 — `/triage`
should **apply** these, never create them.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the
corresponding label string from this table.

## Applying labels in Linear

`save_issue`'s `labels` array **replaces the full label set** — any label not included
is removed. Read the issue's current labels first and re-send the ones you're keeping.

Team `MEM` also carries the categorisation labels `Bug`, `Improvement` and `Feature`.
These are not triage roles; preserve them when changing a triage label.

`wontfix` is a label, not a state. When marking something wontfix, apply the label
**and** move the issue to the `Canceled` state.

Edit the right-hand column if you ever rename these in Linear.
