# Verified Figma MCP Node Map (Vaadin Lumo, Icons, Charts)

Always start with `create_session(fileKey, description)` and reuse the returned `sessionId` across all calls below. Load `figma-design-to-code` before calling `get_design_context`.

---

## 1. Lumo — Vaadin Design System
- **URL:** `https://www.figma.com/design/jqpuzpdBDc37TKHnkVHn1S/Lumo---Vaadin-Design-System--Community-?node-id=6336-32`
- **File Key:** `jqpuzpdBDc37TKHnkVHn1S`

### Foundations
| Topic | Page / Node ID | Notes |
| --- | --- | --- |
| Colors (architecture & contrast scale only — override hues with STI tokens) | `0:1` | Light frame `4977:9489`, Dark frame `4978:9908` |
| Typography | `20:2` | Text scale `1452:10692` (`xxs` 12px -> `xxxl` 40px), field text `1452:10698` |
| Styles (Shadows, Shapes, Input Primitives) | `20:1` | Shadows `5467:14777` (XS–XL), Shapes `5467:15057` (S 4px, M 4px, L 8px), Input states `1468:10629` |
| Lumo Icons | `24:15` | Base 24px icon grid |

### Components
| Component | Page ID | Key Component / Symbol Node IDs |
| --- | --- | --- |
| App Layout & Side Nav | `1406:8952` | App Layout `4889:11052`, Side Nav Item states `5232:2175` (40px height, 8/32/56px indents) |
| Button | `72:174` | Primary `1468:10862`, Default/Secondary `1468:10863`, Tertiary `1468:10864`, Icon-only `1468:10911` / `1468:10924` / `1468:10937` |
| Badge | `383:1067` | Badge matrix `1468:10581` (`Normal`, `Pill`, `Primary`, `Primary pill` × `Default`, `Success`, `Error`, `Contrast`) |
| Grid (Data Tables) | `235:0` | Standard `6462:29797`, Compact `1376:13988`, Filter columns `1376:10553`, Rich content `5484:19621` |
| Form Layout | `1437:21160` | Responsive 2-col/1-col forms, labels on top (`1437:21302`) or aside (`1437:21303`) |
| Text Field | `72:204` | Input primitives `1468:10629` (36px height, 6px label gap, inline error/helper text) |
| Combo Box & Select | `72:528` | Searchable dropdowns and selects |
| Date Picker / Date Time Picker / Time Picker | `288:407`, `1343:1589`, `354:3712` | Schedule and date-range filters |
| Checkbox / Radio Button | `72:187`, `187:0` | Bulk selection and single-choice policy toggles |
| Dialogs & Confirm Dialog | `160:0` | Dialog `185:35`, Confirm Dialog `185:41` (8px radius, tinted footer action bar) |
| Notification | `356:1442` | Variant set `4258:12409` (`Default`, `Primary`, `Contrast`, `Success`, `Error`, `Warning`) |
| Tabs & Tab Sheet | `288:390` | Horizontal tabs `4889:10746`, Vertical tabs `4889:10852`, Tab Sheet `4250:15352` |
| Card | `6652:3767` | Structured card header, media, body, footer actions |
| Dashboard | `6478:48` | Dashboard layout `6480:3811`, Widget variants `6478:7218` (`Outlined`, `Elevated`, `Flat`) |
| Master Detail Layout / Split Layout | `6896:1329`, `514:38` | Table + slide-over/side detail panel workflows |
| Accordion & Details | `72:529` | Collapsible advanced/optional settings |
| Context Menu / Menu Bar / Popover / Tooltip | `357:10158`, `242:369`, `6282:330`, `4256:12243` | Row overflow actions and contextual help |
| Progress Bar / Upload / Avatar | `514:13`, `302:156`, `1743:10605` | Supply stock levels, file upload previews, user avatars |

---

## 2. Vaadin Icons
- **URL:** `https://www.figma.com/design/JqlCuduCvKBHUjF3ibZOEx/Vaadin-Icons--Community-?node-id=0-1`
- **File Key:** `JqlCuduCvKBHUjF3ibZOEx`
- **Main Page:** `0:1` (`Vaadin Icons` — 600+ enterprise web app icons)
- **Usage rule:** Query `get_metadata` / `get_design_context` on specific icons when checking visual metaphor or proportions. In code, keep consistent `16px` (inline/button/badge), `18px` (nav/toolbar), or `20px` (section header) icon sizing using `lucide-react` (or downloaded local SVG assets if an exact custom glyph is required — never leave temporary Figma asset URLs in code).

---

## 3. Vaadin DS — Vaadin Charts
- **URL:** `https://www.figma.com/design/RgsO0wOYq1dki4FJjL0X4R/Vaadin-DS--Vaadin-Charts--Community-?node-id=203-28441`
- **File Key:** `RgsO0wOYq1dki4FJjL0X4R`

| Chart Type | Page ID | Key Nodes | Best Library Use Case |
| --- | --- | --- | --- |
| Column Chart | `7:1` | Standard `11:4827` (6 items), Stacked `11:5278`, Grouped `8:5287` | Weekly/daily attendance, monthly checkouts |
| Bar Chart | `0:1` | Horizontal bars | Popular categories, checkouts by department/program |
| Line Chart | `101:16866` | Time-series lines | Multi-week borrowing, fine collection, or print volume trends |
| Area Chart | `12:17317` | Filled trend | Cumulative revenue or occupancy trends |
| Pie Chart | `11:7765` | Proportional breakdown | Collection status mix, payment method share (Cash vs. GCash) |
| Solid Gauge | `106:22797` | Percentage / capacity | Shelf capacity, ink/paper stock health, clearance rate |
| Legend / Tooltip | `104:19076` | Legend `104:19102`, Tooltip `104:19329` | Interactive tooltips and series legends on every chart |
