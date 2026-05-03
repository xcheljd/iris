# Audit Investigation Template

Use this structure when asking droid to investigate an audit item before execution. Read-only investigation: no code edits, no commits, no destructive operations.

## Required output sections (in order)

### 1. Top-line verdict (1 sentence)

State the verdict in one sentence at the very top so a human can decide in 5 seconds whether to read the rest. Example: *"Dead code confirmed; recommend deletion (Option A). One ancillary security gap surfaced — file as new H-NN."*

### 2. Verification

For each claim in the audit item:
- Confirm or refute with file:line evidence.
- Note discrepancies (e.g., the audit cites line 21 but the actual location is line 24).
- If the claim has multiple parts, address each one.

### 3. Per-claim comparison or analysis

Where the fix involves a choice (delete vs. wire-up, escape vs. strip, merge vs. delete), build a comparison table. Include behavioral parity, security implications, scope/effort estimates.

### 4. Cross-impact (REQUIRED — do not skip)

Scan the audit doc for other open items that this fix could affect. For each overlap, classify:

- **(a) Auto-resolves another item** — this fix incidentally closes another item. Name it. Plan should mark both `[x]` and add separate Resolution Log entries.
- **(b) Breadcrumb opportunity** — this fix establishes a pattern another item will need. Cross-reference in resolutions both ways.
- **(c) Should be done together** — this fix and another are in the same files / domain and would conflict if done separately. Recommend bundling or sequencing.
- **(d) Regression risk** — this fix could break a previously-resolved item. Name the resolved item, the file overlap, and how to guard against the regression.
- **(e) No overlap** — explicit "scanned and found nothing" is preferable to silence.

Specifically check: same files, same domain (auth, tags, outreach, heat, etc.), same patterns (zod, schema-derived enums, useRef, etc.), recently-resolved items in the Resolution Log within the last ~10 entries.

### 5. Judgment calls

Surface every implicit decision the recommendation makes, so the human reviewer can challenge them. Examples:
- "Picked first+last over first+phone for the combo check."
- "Chose deletion over wire-up despite H-17's preference for server actions."
- "Did not add status filter; assumes banned/deleted clients should still trigger duplicate warnings."

If you don't surface these, the human can't push back on them.

### 6. What I didn't check

Honestly name the unknowns. Examples: "Did not verify behavior on production data," "Did not run the dev server to smoke-test," "Did not check whether Sentry/logging would notice the new error path."

### 7. Recommendation

Pick A or B (or however many options you laid out), justify briefly. List the files that would change. Estimate diff size in lines.

## Strict constraints

- **Read-only.** No file edits. No `rm`. No commits. No destructive operations of any kind.
- Word limit ~600. Concision beats comprehensiveness — flag what matters, skip the rest.
- Cite line numbers. Don't assert without evidence.
- Don't speculate beyond what the code shows.
