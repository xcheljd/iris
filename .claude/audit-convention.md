# Audit-Doc Convention (system-prompt append for droid)

You are working in /home/x/friday/Iris on the code audit at `docs/CODE-AUDIT-FINDINGS.md`. Whenever you resolve, file, or modify an audit item, follow this convention strictly.

## Entry format

Every item entry uses **separate lines** for each field. Never use the inline-italic shorthand (`*(Resolved — ...)*` after the heading). The standard structure:

```markdown
- [x] ### M-NN: Item Title
- **File**: `path/to/file.ts:line` (or `**Files**:` for multiple)
- **Category**: e.g., Performance, Security, Maintainability
- One-paragraph description of the issue.
- **Fix**: One-paragraph recommended fix from the audit author.
- **Resolved**: One-paragraph explanation of what was actually done. Reference any cross-impacts on other items, deferred decisions, or trade-offs taken. If a deliberate choice was made between alternatives, name the choice and the reasoning.
```

## Tracking Summary and Executive Summary — both, always

Two count tables exist in the audit doc:

1. **Tracking Summary** (top of doc, around line 11) — per-severity Total / Open / In Progress / Resolved.
2. **Executive Summary** (around line 25) — `Severity | Count (N resolved) | Themes`.

When you close, open, or move an item, **update BOTH tables**. The two have drifted in 5 of 7 prior amend cycles when only one was updated. Verify they match before committing.

**Compute counts from the actual current state**, not from values pre-supplied in your task prompt. The prompt may be stale if other work happened in parallel. Walk the relevant severity sections, count `[ ]` and `[x]`, and write the recomputed values.

The TOTAL row is `severity rows summed`. After updating, verify: `8 + HIGH_total + MEDIUM_total + 17 = TOTAL_total` (CRITICAL=8, LOW=17 unless those change), and the same for Open and Resolved columns.

## Resolution Log

Every resolved or newly-filed item gets a row in the Resolution Log table near the bottom of the doc:

```
| YYYY-MM-DD | M-NN | One-paragraph summary mirroring the Resolved field's key points. Cross-references to other items if relevant. | — |
```

Always include a row, even for newly-filed open items (with the appropriate framing — "New finding added" rather than "Resolved").

The date is today's date. If you are unsure, run `date +%Y-%m-%d` in a Bash tool call and use the result.

## Commit discipline

- **Single commit** per audit item closure unless the prompt explicitly authorizes more.
- Commit message format: `fix: resolve M-NN — short summary` (or `fix: resolve M-NN, file new H-MM` if a new finding is filed alongside).
- Never bundle unrelated audit work into the same commit.

## Verification before commit

Always run these and ensure they pass:

```
npx tsc --noEmit
npx next lint
```

If either reports new errors introduced by your changes, fix them before committing. Pre-existing errors in unrelated files are acceptable to leave (note them in your final report).

## Cross-impact awareness

When resolving an item, scan the audit doc for **other open items** that could be affected:

- **Same files** — does another open item touch the same file? Will your changes conflict, obviate, or constrain the other fix?
- **Same patterns** — if you're applying a pattern (schema-derived enum, zod schema, useRef cleanup, etc.) that another open item also needs, note it as a breadcrumb in the resolution paragraph.
- **Auto-resolution** — does your fix close another item as a side effect? Mark that item resolved too, add a separate Resolution Log row, and link both ways in the resolutions.
- **Regression risk** — could your fix re-break a previously-resolved item? Specifically check the "Resolution Log" section for any item touching the same files within the last 5-10 entries.

If you discover a concern not previously tracked, file it as a new audit item (next available number in its severity tier) before completing the current task. Do not silently absorb out-of-scope concerns.

## Constraints

- Do not modify items outside the scope of the current task without explicit instruction.
- Do not change Tracking Summary numbers in ways the per-severity rows don't justify.
- Do not skip the Resolution Log entry. It is the audit trail.
- Do not use inline italic shorthand for resolutions. Always use the multi-line format.
