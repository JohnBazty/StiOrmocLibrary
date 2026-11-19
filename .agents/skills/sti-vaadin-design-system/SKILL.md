---
name: sti-vaadin-design-system
description: Build and overhaul STI College Ormoc ILMS screens using Vaadin Lumo component anatomy, Vaadin Icons, and Vaadin Charts via the Figma MCP server, strictly themed with STI College Ormoc's project colors (never Lumo's default blue) and governed by the Vibe Monday UX Writing Handbook. Use for any UI design, component creation, token styling, dashboard chart, dialog, form, table, or microcopy work in this repository.
---

# STI College Ormoc — Vaadin Lumo Design System & UX Writing

Use this skill whenever designing, building, auditing, or overhauling screens and shared components in `apps/web`.

This skill combines **four authoritative inputs** in strict precedence order:
1. **Project Rules & Color Theme** (`agent.md`, `AGENTS.md`, `apps/web/src/index.css`) — **ALWAYS wins on brand colors, semantic color meaning, accessibility, and business rules.**
2. **Vaadin Lumo, Vaadin Icons & Vaadin Charts** (inspected live via the `figma_figma` MCP server) — governs **layout density, component anatomy, typography scale, spacing, radii, elevation, table/grid ergonomics, form controls, dialogs, notifications, icons, and chart structure.**
3. **Vibe Monday UX Writing Handbook** — governs **every heading, label, helper text, error message, empty state, confirmation dialog, and CTA.**
4. **Non-Technical User First Rule** (`agent.md`) — plain library words, clear next actions, automatic recognition, collapsed optional settings, zero raw database IDs or backend error codes.

---

## 1. Mandatory Figma MCP Workflow

Whenever building or refactoring a component, layout, icon slot, or chart:

1. **Create a Figma session first** (required even for read-only lookups):
   - Call `figma_figma` -> `create_session` with the target `fileKey` and a short task description.
   - Reuse the returned `sessionId` UUID across all subsequent calls in the task (including across the three library files).
2. **Load `figma-design-to-code` before calling `get_design_context`** (mandatory prerequisite). Always pass `skillNames: "figma-design-to-code"`, `clientFrameworks: "react,tailwindcss"`, `clientLanguages: "typescript,css"`.
3. **Inspect the exact component or chart node** from the verified library map in `.agents/skills/sti-vaadin-design-system/references/figma-nodes.md`:
   - **Vaadin Lumo Design System**: `fileKey = jqpuzpdBDc37TKHnkVHn1S`
   - **Vaadin Icons (600+ enterprise icons)**: `fileKey = JqlCuduCvKBHUjF3ibZOEx`
   - **Vaadin Charts**: `fileKey = RgsO0wOYq1dki4FJjL0X4R`
4. **Translate anatomy — NEVER copy Lumo colors or add unapproved libraries**:
   - Adopt Lumo's dimensions, hierarchy, states (`Default`, `Hover`, `Focus`, `Invalid`, `Read only`, `Disabled`), spacing, radii, shadows, and alignment.
   - Replace every `--lumo-primary-*` / `#006af5` / `#005fdb` / `#5AC2F7` value with the **STI semantic CSS tokens** (`--sl-*`) defined in `.agents/skills/sti-vaadin-design-system/references/sti-lumo-tokens.md`.
   - Implement in the repo's existing stack (**React + TypeScript + Tailwind CSS v4 + `lucide-react`**). Never install Vaadin web components or a new UI/chart library without explicit owner approval.

---

## 2. STI Color Theme Mapped to Lumo Architecture

Read `.agents/skills/sti-vaadin-design-system/references/sti-lumo-tokens.md` for the full CSS token table (Light + Dark mode).

### Non-Negotiable Color Rules
- **Brand Primary (STI Blue)**: `#0b5ea2` (hover `#094e87`, active `#073e6c`, 10% tint `rgba(11, 94, 162, 0.10)`). Replaces `#003399` legacy drift and Lumo `#006af5`.
- **Brand Accent (STI Yellow)**: `#FFF200`. Use **only** for the brand mark, dark-mode active sidebar pill (with `#0b5ea2` ink), and rare deliberate brand highlights. **NEVER** use yellow for error alerts, success banners, or text on light backgrounds.
- **Navigation Rail**: Deep STI Navy `#132a3f` in both light and dark modes for visual anchoring.
- **Readable Neutral Surfaces & Body Ink** (per `agent.md` 2026-10-17 owner direction):
  - Light canvas `#F7F9FC`, elevated surfaces `#FFFFFF`, subtle fill `rgba(19, 42, 63, 0.04)`, hairlines `rgba(19, 42, 63, 0.12)`.
  - Headings `#132a3f`, body copy `#1e293b`, secondary copy `#475569`, captions `#64748b`. Stop painting every paragraph bright brand blue (`#0b5ea2`); reserve `#0b5ea2` for interactive controls, links, focus, and brand accents so actionable elements stand out immediately.
  - Dark canvas `#14151b`, elevated surfaces `#1e202b`, hairlines `rgba(255, 255, 255, 0.14)`, text `#f7f9ff` / `rgba(247, 249, 255, 0.78)`.
- **Strict Semantic Colors** (always paired with explicit text + icon, never color alone):
  - **Error (Red ONLY)**: `#b42318` solid / `#fef2f2` soft fill + `#991b1b` ink (dark: `#fca5a5` ink on `rgba(180, 35, 24, 0.22)`). Always `role="alert"`.
  - **Success (Green ONLY)**: `#166534` solid / `#f0fdf4` soft fill + `#166534` ink (dark: `#86efac` ink on `rgba(22, 101, 52, 0.24)`). Always `role="status"` + `data-tone="success"`.
  - **Warning (Amber ONLY)**: `#b45309` solid / `#fffbeb` soft fill + `#92400e` ink (dark: `#fcd34d` ink on `rgba(180, 83, 9, 0.24)`).
  - **Info (STI Blue)**: `#0b5ea2` solid / `rgba(11, 94, 162, 0.10)` soft fill.
  - **Neutral (Slate)**: returned, archived, inactive, offline, draft — visually distinct from active/available.
- **WCAG AA Contrast**: >= 4.5:1 normal text, >= 3:1 large text, icons, borders, and focus rings in both light and dark modes.

---

## 3. Lumo Enterprise Structural Grammar

Apply these Lumo measurements consistently across all admin and portal screens:

| Element | Lumo-Aligned STI Spec |
| --- | --- |
| **Typography** | `Poppins` (`--font-sans` / `--font-display`). Page title `24–28px` SemiBold (`1.25`), Section title `18–20px` SemiBold, Card/Table heading `15–16px` SemiBold, Body `14px` Regular (`1.5`), Table header & Badge `12–13px` Medium/SemiBold, Helper/Error text `13px` (`1.35`). Use `tabular-nums` for counts, dates, currency (`₱`), barcodes. |
| **Radii** | Small (`4px`): checkboxes, micro tags. Medium (`6px`): buttons, inputs, selects, side-nav items, standard badges. Large (`8px`–`12px`): cards, tables, dialogs, banners, popovers. Pill (`9999px`): status pill badges only. Eliminate oversized `rounded-[1.75rem]` / `rounded-2xl` toy-like bubbles on operational panels. |
| **Control Heights** | Desktop inputs, selects, and buttons: `36px` (`h-9`)–`40px` (`h-10`) for crisp operational density; mobile (`<= 639px`): `min-h-[44px]` touch target floor preserved. |
| **Buttons** | 3 clear visual weights: `primary` (solid `#0b5ea2`, max **one** per toolbar/dialog), `secondary` (subtle neutral surface + crisp border), `tertiary`/`ghost` (text-only with hover tint), plus semantic `danger` (`#b42318`) and `success` (`#166534`) variants. Clear hover, active, focus-visible ring, and disabled states. |
| **Form Fields** | Label **above** input (`6px` gap, `13px` SemiBold, never ALL-CAPS shouting). Soft subtle surface or crisp border (`--sl-border`), clear STI Blue focus ring. Invalid state: soft red tint + red border + inline `13px` error text directly below the field (`aria-describedby`). Helper text only when it prevents an error. |
| **Data Tables (Vaadin Grid)** | Preferred over card lists for >= 3-column operational records. Clean `44px` header row, `1px` row dividers (`--sl-border`), subtle hover highlight, compact `44–52px` row height, right-aligned numeric/currency columns, sortable indicators, single concise Actions column (`RowActions` or 1 primary + overflow). Never embed multi-field `<dl>` cards inside `<td>`. Wrap in `ResponsiveTable` so mobile stays readable. |
| **Side Navigation** | `40px` item height, `8px` padding, `12px` icon-label gap, hierarchical indent `8px -> 24px -> 40px`, optional compact count badge on the right, clear active background + high-contrast ink. |
| **Dialogs & Confirmations** | `8px–12px` radius, neutral dark scrim (`rgba(15, 23, 42, 0.55)`), `20px 24px` header with specific title (never "Are you sure?"), scrollable body, subtle tinted footer bar (`--sl-surface-subtle`) with Cancel on the left/secondary and one specific Primary/Danger CTA on the right. |
| **Banners & Notifications** | Inline status/alert banners use `8px` radius, left icon, concise message, and optional direct action button/link. Use soft tinted surfaces with strong left accent border or solid high-contrast bar — always matching Error=red, Success=green, Warning=amber, Info=blue. |
| **Charts (Vaadin Charts)** | Built as clean accessible SVG/HTML charts (zero extra heavy chart deps unless approved) following Vaadin Charts geometry: crisp gridlines (`--sl-border`), clear axis labels (`11–12px` tabular-nums), STI chart series palette, interactive hover/focus tooltips, horizontal or vertical legend, and a screen-reader/table fallback. |

---

## 4. Vibe Monday UX Writing Standards

Read `.agents/skills/sti-vaadin-design-system/references/ux-writing-handbook.md` for the full handbook and STI Library microcopy examples.

Always apply the **6 Golden Rules** on every screen you touch:
1. **Bottom line first** — Lead with the outcome, blocker, or action needed.
2. **Give full context** — Show the page description (never hide `PageHeader` descriptions!), item title/borrower in dialogs, and active filter scope.
3. **Focus on the user's point of view** — Say what the librarian/staff/student can do next, not internal system mechanics.
4. **One CTA** — One primary button per section/dialog/row. Demote secondary actions to `secondary`, `ghost`, or `RowActions`.
5. **Use specific CTAs** — The button must directly answer the heading (e.g., heading `"Cancel this reservation?"` -> CTA `"Cancel reservation"`, NOT `"Are you sure?"` -> `"Yes, save"`).
6. **Cut the fluff** — Remove repetitive paragraphs, redundant notices, raw error codes, and database jargon.

---

## 5. Reference Files

Load only what the current task needs:
- `.agents/skills/sti-vaadin-design-system/references/figma-nodes.md` — Verified Figma MCP file keys, page IDs, and key component node IDs for Vaadin Lumo, Vaadin Icons, and Vaadin Charts.
- `.agents/skills/sti-vaadin-design-system/references/sti-lumo-tokens.md` — Exact Light & Dark CSS custom property contract (`--sl-*`) mapping Lumo tokens onto STI's palette.
- `.agents/skills/sti-vaadin-design-system/references/ux-writing-handbook.md` — Complete Vibe Monday UX Writing Handbook (Principles, Personality, Voice, 8-step Tone Spectrum, Values, Golden Rules, and STI Library before/after copy guide).
