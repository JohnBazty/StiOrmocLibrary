# Critical Page Audit Rubric & Decision Matrices

## 1. Severity Levels
- **P0 (Broken Trust / Blocker):** Dead-end validation (user completes a flow/booking only to fail at submit), wrong semantic color masking an error/success, broken keyboard/modal focus, or accidental business-rule/data loss.
- **P1 (High Friction / Structural):** Wrong data representation (e.g., card list instead of scannable table for operational queue), missing next-step guidance, multiple competing primary CTAs, unreadable contrast, raw backend codes exposed to users.
- **P2 (Noise & Inconsistency):** Duplicated descriptions or counts, inconsistent input/button heights or border radii, legacy `#003399` or hardcoded hex drift, missing empty-filter `"Clear filters"` action, generic dialog titles (`"Are you sure?"`).
- **P3 (Polish):** Alignment micro-tweaks, tabular numerals, compact icon sizing, redundant helper copy.

## 2. Data Representation Decision Matrix (Gate 1)

| Scenario | Correct Pattern | Wrong Pattern to Flag |
| --- | --- | --- |
| 3+ comparable fields across operational records (loans, queue, schedules, fines, payments, print jobs, attendance, users, clearance, catalog, copies) | **Vaadin Grid / `ResponsiveTable`** (5–7 focused columns, 44–52px rows, sortable headers, single Actions column) | Stacked `<article>` cards, 2-col card grids, or nested `<dl>` cards inside `<td>` |
| 2–4 summary counts driving triage at top of a page | **Compact KPI Strip** (click-to-filter when actionable, `tabular-nums`, concise 1-line note) | 6–8 disconnected stat cards duplicating counts already shown in tabs |
| Detailed single record inspection (barcode, shelf map, audit trail, metadata tabs) | **Detail Drawer / Master-Detail Panel** opened from a table row | Expanding huge inline accordions or dumping 12 fields into one table row |
| Browsing visual catalog items by cover (Student/Faculty shop) | **Visual Card Grid** with clean cover, title, author, availability badge, 1 primary CTA | Cramming raw ISBN, accession, and 4 action buttons onto every card |
| Policy / Setup / Schedule editing | **Grouped Lumo `FormLayout`** (2-col on desktop, 1-col on mobile, top labels, explicit review summary before save) | Unstructured walls of stacked inputs with no section grouping or inline validation |
| Secondary / destructive row actions | **`RowActions` menu** (1 primary inline button max + overflow menu for secondary/destructive actions) | 4–5 full-size buttons stacked vertically in every row |

## 3. Section Necessity Checklist (Gate 2)
Remove, merge, or collapse any element that fails these questions:
1. Is this exact number or explanation **already shown** elsewhere on the same viewport? -> **Delete duplicate.**
2. Does this disclaimer explain an internal rule that should instead be **enforced automatically by the control**? -> **Replace prose with proactive UI guard.**
3. Is this control used **less than once a week** (e.g., archive setup, batch utilities, retention rules) while sitting beside high-frequency counter buttons? -> **Move to a dedicated tab or collapsible disclosure.**
4. Are there **more than 1 primary (`#0b5ea2`) button** competing in the same header, form, or row? -> **Demote secondary buttons to `secondary` or `ghost`.**
5. Does `PageHeader` receive a `description` prop that isn't rendered, causing a loose `<p>` below? -> **Render `description` inside `PageHeader` once and delete the stray `<p>`.**
