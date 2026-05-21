# Iris Documentation

## Active Documents

| Document | Description | Status |
|----------|-------------|--------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture, data model, auth flow, key design decisions | Reference |
| [FEATURE-PROPOSALS.md](FEATURE-PROPOSALS.md) | Feature backlog inspired by industry CRM research (BSPK, Endear, Tulip, etc.) | Tracking — 14/20 shipped |
| [REST-API-EXPANSION.md](REST-API-EXPANSION.md) | Proposal to expose existing server actions as REST endpoints for mobile/scripting/QA | Proposed (not started) |

## Archive

Historical documents from completed work. Kept for reference.

| Document | Description | Completed |
|----------|-------------|-----------|
| [Archive/CODE-AUDIT-FINDINGS.md](Archive/CODE-AUDIT-FINDINGS.md) | Full codebase security/quality audit — 84 findings, all resolved | Apr 2026 |
| [Archive/CODE-REVIEW-2026-05.md](Archive/CODE-REVIEW-2026-05.md) | Second full-codebase review — 74 findings + 7 residuals, all resolved | May 2026 |
| [Archive/CODE-QUALITY-REVIEW-2026-05.md](Archive/CODE-QUALITY-REVIEW-2026-05.md) | Follow-up quality pass — 20 findings, all resolved | May 2026 |
| [Archive/PRD-MeridianCRM.md](Archive/PRD-MeridianCRM.md) | Original product requirements (24 feature sections, data model, routes) | Apr 2026 |
| [Archive/PERMISSIONS-PLAN.md](Archive/PERMISSIONS-PLAN.md) | 6-phase permissions overhaul: action gating, approval queue, scoping, read-only, activity, nav | Apr 2026 |
| [Archive/DESIGN-SYSTEM-GAP-ANALYSIS.md](Archive/DESIGN-SYSTEM-GAP-ANALYSIS.md) | Design system audit — 9 gaps, 7 components extracted, 1 evaluated/skipped | Apr 2026 |
| [Archive/visual-improvements.md](Archive/visual-improvements.md) | 10-phase UI polish changelog (skeletons, mobile, accessibility, components) | Apr 2026 |
| [Archive/visual-testing-report.md](Archive/visual-testing-report.md) | Visual + interaction test report across 14 pages | Apr 2026 |
| [Archive/plan-001-employee-management.md](Archive/plan-001-employee-management.md) | Employee CRUD: 5 server actions + change-password page | Apr 2026 |
| [Archive/plan-002-structured-products-of-interest.md](Archive/plan-002-structured-products-of-interest.md) | Structured `ProductOfInterest[]` + durable `model_catalog`; uppercase-model normalize; exact-field promo match | May 2026 |
| [Archive/plan-003-intent-unified-table-catalog-correction.md](Archive/plan-003-intent-unified-table-catalog-correction.md) | Intent column on POI, unified interests table, catalog correction flow | May 2026 |
| [Archive/plan-004-collections-csv-export.md](Archive/plan-004-collections-csv-export.md) | Collections-interest CSV export (detail grain, scope filters) | May 2026 |
| [Archive/plan-005-preferred-contact-method.md](Archive/plan-005-preferred-contact-method.md) | `preferredContact` enum + required `lastName`; cascading validation | May 2026 |
| [Archive/plan-006-brand-sizes-promo-table.md](Archive/plan-006-brand-sizes-promo-table.md) | Brand + inventory sizes on promos; promo-table sort/filter; brand-intent match (later retired in [ffee6fc](#)) | May 2026 |
| [Archive/plan-007-matched-clients-tab.md](Archive/plan-007-matched-clients-tab.md) | "Matched Clients" tab in Promo Manager with sort/filter/RBAC | May 2026 |
| [Archive/plan-008-matched-clients-csv-export.md](Archive/plan-008-matched-clients-csv-export.md) | Matched Clients CSV export mirroring collections-export | May 2026 |
| [Archive/plan-009-catalog-authoritative-rvx-derive-at-read.md](Archive/plan-009-catalog-authoritative-rvx-derive-at-read.md) | Authoritative `model_catalog` via RVX import; derive-at-read collection/brand from catalog | May 2026 |

## Contributing

When adding a new document:
1. Add it to the appropriate table above (Active or Archive).
2. Include a date and status at the top of the file.
3. If the document tracks progress (findings, proposals), use checkboxes and update the summary counts when items change.
4. When work in an active doc is complete, move it to Archive and update both tables.
