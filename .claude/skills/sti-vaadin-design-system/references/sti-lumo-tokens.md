# STI College Ormoc × Vaadin Lumo Token Contract

Maps Vaadin Lumo's enterprise token structure onto STI College Ormoc's brand theme. **Never use Lumo's `#006af5` blue or `#5AC2F7` chart cyan.**

## 1. Color Tokens (`apps/web/src/index.css`)

| Semantic Token | Light Mode Value | Dark Mode Value | Purpose |
| --- | --- | --- | --- |
| `--sl-brand` | `#0b5ea2` | `#2b82cb` (text/links) / `#0b5ea2` (solid CTA bg) | STI primary interactive color |
| `--sl-brand-hover` | `#094e87` | `#0e6cb8` | Primary CTA hover |
| `--sl-brand-active` | `#073e6c` | `#08497e` | Primary CTA active/pressed |
| `--sl-brand-soft` | `rgba(11, 94, 162, 0.10)` | `rgba(56, 146, 224, 0.20)` | Subtle brand highlight / active tint |
| `--sl-brand-contrast` | `#ffffff` | `#ffffff` | Text on solid `--sl-brand` |
| `--sl-accent` | `#FFF200` | `#FFF200` | STI Yellow brand mark & dark active nav pill |
| `--sl-accent-ink` | `#132a3f` | `#0b5ea2` | High-contrast ink on `--sl-accent` |
| `--sl-sidebar-bg` | `#132a3f` | `#0f1f30` | Deep STI Navy navigation rail |
| `--sl-bg` | `#f7f9fc` | `#14151b` | Page canvas |
| `--sl-bg-elevated` | `#ffffff` | `#1e202b` | Cards, tables, dialogs, popovers |
| `--sl-bg-subtle` | `#f1f5f9` | `rgba(255, 255, 255, 0.06)` | Table header tint, input fills, dialog footer |
| `--sl-bg-hover` | `rgba(19, 42, 63, 0.04)` | `rgba(255, 255, 255, 0.08)` | Table row & ghost button hover |
| `--sl-text-header` | `#132a3f` | `#f7f9ff` | Headings, stat figures, strong titles |
| `--sl-text` | `#1e293b` | `#e9eef8` | Primary readable body copy |
| `--sl-text-secondary` | `#475569` | `rgba(247, 249, 255, 0.78)` | Supporting labels, table metadata |
| `--sl-text-muted` | `#64748b` | `rgba(247, 249, 255, 0.58)` | Captions, timestamps, placeholders |
| `--sl-border` | `rgba(19, 42, 63, 0.12)` | `rgba(255, 255, 255, 0.14)` | Card & table dividers |
| `--sl-border-strong` | `rgba(19, 42, 63, 0.24)` | `rgba(255, 255, 255, 0.26)` | Input borders, secondary buttons |

## 2. Semantic Status Tokens (Strictly Enforced)

| State | Solid BG | Soft BG (Light / Dark) | Text Ink (Light / Dark) | Required ARIA / Attr |
| --- | --- | --- | --- | --- |
| **Error / Overdue / Blocked** | `#b42318` | `#fef2f2` / `rgba(180, 35, 24, 0.24)` | `#991b1b` / `#fca5a5` | `role="alert"` on banners |
| **Success / Cleared / Paid / Available** | `#166534` | `#f0fdf4` / `rgba(22, 101, 52, 0.24)` | `#166534` / `#86efac` | `role="status" data-tone="success"` |
| **Warning / Due Soon / Low Stock / Pending Review** | `#b45309` | `#fffbeb` / `rgba(180, 83, 9, 0.24)` | `#92400e` / `#fcd34d` | `role="status" data-tone="warning"` |
| **Info / Active / Borrowed / In Progress** | `#0b5ea2` | `rgba(11, 94, 162, 0.10)` / `rgba(56, 146, 224, 0.22)` | `#0b5ea2` / `#93c5fd` | `role="status" data-tone="info"` |
| **Neutral / Returned / Archived / Inactive** | `#475569` | `#f1f5f9` / `rgba(255, 255, 255, 0.10)` | `#475569` / `#cbd5e1` | None required |

## 3. Chart Series Palette (STI-Themed Vaadin Charts)

Use in order for multi-series charts; pair with clear labels/tooltips (never rely on color alone):
1. `--sl-chart-0`: `#0b5ea2` (STI Primary Blue)
2. `--sl-chart-1`: `#0f766e` (Teal)
3. `--sl-chart-2`: `#d97706` (Amber)
4. `--sl-chart-3`: `#4f46e5` (Indigo)
5. `--sl-chart-4`: `#64748b` (Slate)
- Negative / Overdue series: `#b42318`
- Positive / Cleared series: `#166534`

## 4. Lumo Geometry & Elevation Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--sl-radius-s` | `4px` | Checkboxes, small tags |
| `--sl-radius-m` | `6px` | Inputs, buttons, selects, nav items, standard badges |
| `--sl-radius-l` | `10px` | Cards, tables, dialogs, banners, popovers |
| `--sl-control-h` | `38px` (mobile `44px`) | Standard inputs, selects, buttons |
| `--sl-shadow-xs` | `0 1px 2px rgba(19, 42, 63, 0.06)` | Cards, tables |
| `--sl-shadow-s` | `0 2px 6px rgba(19, 42, 63, 0.08)` | Tooltips, dropdown menus |
| `--sl-shadow-m` | `0 8px 24px -4px rgba(19, 42, 63, 0.14)` | Popovers, floating action menus |
| `--sl-shadow-l` | `0 16px 40px -8px rgba(19, 42, 63, 0.24)` | Modal dialogs, drawers |
| `--sl-shadow-xl` | `0 20px 56px -8px rgba(19, 42, 63, 0.30)` | Toast notifications |
