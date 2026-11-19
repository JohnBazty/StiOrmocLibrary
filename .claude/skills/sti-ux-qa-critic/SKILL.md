---
name: sti-ux-qa-critic
description: Critical UI/UX Quality Assurance auditor and overhaul critic for STI College Ormoc ILMS. Use to judge any page or workflow critically across 7 hard gates: data representation (table vs. card vs. list), section necessity and anti-noise, proactive zero-dead-end validation, next-step guidance, Vibe UX writing clarity, STI × Vaadin Lumo visual consistency, and business-rule safety. Pair with `sti-vaadin-design-system` before modifying or signing off any screen.
---

# STI College Ormoc — UX Quality Assurance & Page Critic

Use this skill to **critically audit** every screen before overhauling it and to **gate every UI PR/phase** before calling it done.

Do **not** treat the existing screen layout as sacred. Your job is to judge each page honestly, cut noise, fix frustrating dead-end validations, guide users clearly to their next step, and unify every page under `sti-vaadin-design-system` **without breaking a single business rule or backend contract.**

---

## The 7 Hard Quality Gates

Every audited or redesigned screen must be scored against all 7 gates. Read `.claude/skills/sti-ux-qa-critic/references/audit-rubric.md` for the full decision tables and severity rubric.

### Gate 1 — Data Representation Critique (Table vs. Card vs. List vs. KPI)
Ask on every single collection or section: **"Why is this rendered as cards instead of a table (or vice versa)?"**
- **MUST be a Vaadin-style Grid/Table (`ResponsiveTable` + `TableShell`)**:
  - Any repeating operational record with **>= 3 comparable attributes** where staff scan, compare, filter, sort, or act across rows: active loans, reservation queue, scheduled pickups, fines, online payments, print queue, attendance logs, users, clearance master list, catalog titles, inventory copies, accession register, audit history.
- **NEVER do these**:
  - Stacked `<article>` card lists or 2-column card grids for tabular queues (e.g., loans, scheduled pickups, payment queues, print jobs).
  - Stuffing multi-field `<dl>` summary boxes inside `<td>` table cells (destroys scan speed and inflates row height).
  - Duplicating the same data field across two columns (e.g., showing `Requested` in both a date column and inside a copy-details cell).
- **Cards are justified ONLY when**:
  - Top-level KPI strip (max 4 compact cards with meaningful count + short context note).
  - Visual media browsing where book/research covers are the primary visual cue.
  - Distinct grouped settings/policy sections or a small visual inventory meter (<= 6 consumables).
- **Slide-over Detail Drawer / Master-Detail**:
  - Use when a record has > 6 secondary metadata fields (barcodes, ISBN, publisher, shelf coordinates, full timeline) so the main table stays crisp (5–7 columns max).

### Gate 2 — Section Necessity & Anti-Noise Audit
Interrogate every block on the page: **"What decision or action does this section enable right now?"**
- **Cut or collapse**:
  - Duplicated page descriptions (never pass `description` to `PageHeader` AND repeat it as a `<p>` underneath).
  - Redundant stat cards whose numbers already appear on filter tabs right below them.
  - Scattered timezone/policy disclaimer paragraphs (consolidate into one quiet caption or contextual tooltip).
  - Rarely-used maintenance/setup controls sitting inside daily operational screens.
  - Competing primary buttons — enforce **max 1 primary CTA** per page header, section toolbar, dialog, and table row.
- **Visual calm**:
  - Replace noisy all-blue text walls with neutral readable body ink (`--sl-text`) so STI Blue (`#0b5ea2`) signals interactivity.
  - Replace bulky `rounded-2xl` / double-bordered boxes with clean Lumo `8px–10px` surfaces and `1px` dividers.

### Gate 3 — Zero Dead-End Validation & Proactive Prevention (CRITICAL)
Read `.claude/skills/sti-ux-qa-critic/references/validation-and-flow-checklist.md` for all library-specific preflight rules.

**Hard Rule: NEVER let a user complete a booking, form, or confirmation dialog only to fail on a predictable rule after clicking Submit.**

Enforce the **3-Layer Validation Contract**:
1. **Layer 1 — Proactive Prevention (Before the user acts):**
   - Load eligibility, limits, active holds, unpaid balances, stock levels, printer availability, and library open/closed status **upfront** before the user clicks the action.
   - If an action is currently blocked (e.g., student at 2/2 borrow limit, unpaid fines, already holding the title, 2/2 pending schedules, zero paper/ink, copy actively borrowed), **prevent starting the dead-end flow**: disable the blocked trigger (or replace it with the resolution action) and display a clear plain-language reason + direct link to fix it right next to the control.
2. **Layer 2 — Live Inline Field Validation (While typing/selecting):**
   - Validate required fields, min/max bounds, date ranges (`dateFrom <= dateTo`, `closeTime > openTime`), peso amounts (`> 0`), 13-digit GCash reference numbers, ISBN/barcode formats, email domains (`@ormoc.sti.edu.ph` / `@sti.edu`), and override reason length (`>= 10 chars`) **inline on blur/change**.
   - Highlight the exact invalid input with Lumo invalid styling (`border` + soft error tint + `13px` error text linked via `aria-describedby` + `aria-invalid="true"`).
   - Disable form submission when client-verifiable fields are incomplete/invalid, or focus the first invalid field with an inline explanation when attempted.
3. **Layer 3 — Authoritative Server Recovery (On submit):**
   - Keep server validation and RBAC authoritative (`agent.md`).
   - Map server field errors back to the exact field. Translate backend error codes into plain language. Preserve every unsaved draft value on failure and reuse idempotency keys (`clientRequestId`) on retry.

### Gate 4 — Next-Step Guidance & Workflow Continuity
Every state on every screen must clearly tell the user **what to do next**:
- **Page header:** 1-line description stating the goal and typical first step.
- **Empty states:** Distinguish *zero records* (show primary CTA to create/start or explain where records come from) from *zero filter matches* (show active query + one-click `"Clear filters"` button).
- **Success notices:** Confirm what changed **and** name the next handoff step with a direct link when cross-page (e.g., `"Copy marked ready for pickup. Open Borrow & return counter when the borrower arrives."`).
- **Error notices:** State what happened, reassure that nothing unsafe happened, and offer a concrete recovery button (`Retry`, `View unpaid fines`, `Check schedule`).
- **No orphaned pages:** Every workflow handoff (Reservations -> Circulation Counter, Lost Report -> Clearance, Unpaid Fine -> Payments) links directly with query context.

### Gate 5 — Vibe UX Writing & Non-Technical Language Gate
Verify against `sti-vaadin-design-system` -> `references/ux-writing-handbook.md`:
- Bottom line first; concise sentences; active voice.
- Specific dialog titles and matching primary button verbs (zero `"Are you sure?"`, `"Yes, save"`, `"OK"`, `"Submit"`).
- Zero raw machine codes (`warning.code`, `STUDENT_BORROW_LIMIT_REACHED`), SQL/table names, or raw database IDs shown as primary labels.
- Consistent library vocabulary across all admin/staff/student pages.

### Gate 6 — Design System & Accessibility Consistency Gate
Verify against `sti-vaadin-design-system`:
- STI palette tokens only (`#0b5ea2`, `#132a3f`, `#FFF200` accent-only, readable neutrals) — zero legacy `#003399` drift, zero Lumo `#006af5` copy-paste.
- Strict semantic status colors: Error=red (`role="alert"`), Success=green (`role="status" data-tone="success"`), Warning=amber, Info=blue, Neutral=slate — **never** yellow (`#FFF200`) for errors or success notices.
- Every status badge pairs color with explicit text AND an icon (never color alone).
- Light mode AND dark mode pass WCAG AA (>= 4.5:1 text, >= 3:1 UI/focus).
- Mobile (`<= 639px`) maintains `>= 44px` touch targets, no horizontal page overflow, and `ResponsiveTable` stacking.
- Every file/image chooser preserves `SelectedFilePreview` owner rules (`agent.md`).

### Gate 7 — Business Rules & Regression Safety Gate
UI overhauls MUST preserve 100% of existing business rules (`agent.md`, `docs/source-of-truth.md`):
- Role/RBAC separation (`Admin`, `Librarian`, `Staff`, `Faculty`, `Student`) and CSRF protection.
- Borrowing cap (2 active for students, configurable/exempt for faculty), barcode-per-physical-copy, 1-day default due 8:59 AM next operating day, single-day renewal eligibility, PHP 2/hr + PHP 10/day fines, cash + manually verified 13-digit GCash payments, clearance rules + documented overrides, print status progression (`pending -> printing -> ready_for_pickup -> picked_up/completed`), archive preservation, idempotency keys.
- **Verification before claiming done:**
  1. Write or update Vitest + Testing Library tests first (confirm failure -> implement -> pass).
  2. Run focused tests, full `npm test -w @sti-library/web`, `npm run typecheck`, and `npm run build`.
  3. Visually inspect desktop and mobile screens when running the app.
  4. Commit every logical phase/change cleanly in Git on a feature branch so every step is individually revertible.

---

## Standard Page Critique Output Template

When auditing any page, produce this exact compact structure before editing:

```markdown
### Page Audit: `<Page Name>` (`<file path>`)
- **Primary user job:** <1 sentence>
- **Verdict:** Pass | Needs Cleanup | Major Overhaul
- **Findings (by Gate & Severity P0–P3):**
  - `[P0 / Gate 3]` <Exact line + dead-end validation issue + fix>
  - `[P1 / Gate 1]` <Card list -> Table conversion + exact columns>
  - `[P2 / Gate 2]` <Noise/duplicate section to remove or collapse>
- **Keep intact (Business Rules & API contracts):** <Bullet list>
- **Recommended Changes:** <Keep / Change / Remove / Validate bullets>
```

---

## Reference Files
- `.claude/skills/sti-ux-qa-critic/references/audit-rubric.md` — Detailed Table vs. Card decision matrix, section necessity rubric, and P0–P3 severity definitions.
- `.claude/skills/sti-ux-qa-critic/references/validation-and-flow-checklist.md` — Complete STI Library proactive validation checklist covering borrowing, reservations, scheduling, fines, payments, printing, catalog, inventory, clearance, and user enrollment.
