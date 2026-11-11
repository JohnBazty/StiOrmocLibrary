# Adapt the owner's Claude skill collection for Codex

| Field | Value |
| --- | --- |
| Date created | 2026-10-16 |
| Date last updated | 2026-10-16 |
| Status | `built` |

## Why

The owner requested that Codex apply the 36 skill files in `C:/Users/JOHN/Documents/SSL/.claude/skills` to its own skills. That parent folder is outside this repository and was not in the session's automatically available skill catalog.

## How

Install namespaced `claude-*` Codex entrypoints in the configured personal Codex skills directory, preserving the original instructions as local references and leaving the source files unchanged. Use scoped descriptions so ordinary requests do not load every skill. Adapt platform-specific tool names, workflow gates and missing helper dependencies to available Codex tools and the owner's authorized task. Keep repository architecture, source documents and nontechnical-user requirements authoritative for this project. No skill installation grants permission for external actions or database changes.

The supplied collection contains instruction files only. Missing scripts, data, plugin commands and references must be disclosed when needed; installing an entrypoint does not install those capabilities. Scientific Agent Skills is a collection overview, not the 134 individual scientific skills it describes. Prefer already available first-party document, spreadsheet, browser and Figma tooling for their supported operations.

## Implementation tracking

- [x] Locate and inventory the owner's 36 files.
- [x] Install compatible entrypoints and preserve source content.
- [x] Validate names, descriptions, local reference integrity and unchanged originals.
- [x] Add project guidance for selecting relevant installed skills.

## Verification and use

- **Full reading completed on 2026-10-16:** Read all 36 supplied original guides in full, including their examples and limitations. This supersedes the earlier description-only inventory. Read the task-relevant guide again when its details are needed or its file changes; do not activate every guide for each task.
- Installed **36** namespaced `claude-*` entrypoints at `C:/Users/JOHN/.codex/skills`. The installed names distinguish this collection from bundled skills. Examples: `$claude-ui-ux-pro-max`, `$claude-systematic-debugging`, `$claude-webapp-testing`.
- All 36 passed the bundled skill creator's `quick_validate.py` checks. Original source SHA-256 hashes are unchanged; all preserved reference files match the originals byte-for-byte. Entrypoints have valid scoped names/descriptions and existing local reference targets.
- The validator required PyYAML, which was temporarily installed separately from application dependencies. No project dependency manifests or lockfiles changed.
- Automatic approval review rejected removal of `C:/Users/JOHN/AppData/Local/Temp/codex-skill-validation-20261016` as blocked by policy, without a more specific stated reason. That temporary validator dependency folder is retained; the cleanup was not retried through another mechanism.
- Added project selection guidance to `AGENTS.md`. Codex can use these installed skills starting on the next turn; this current session can also read their files directly.
- No application features, database records, schema, credentials, running services, GitHub branches or deployments changed. No upstream source helpers were downloaded or executed. Supporting-script limitations remain explicitly documented in every installed entrypoint.

## Selecting relevant guidance

| Task | Relevant guides |
| --- | --- |
| Interface simplification or responsive design | UI/UX designer, UI/UX Pro Max, baseline UI; React UI patterns when loading/error states matter |
| Reproducible bug or failed test | Systematic debugging; webapp testing for browser behavior |
| React or TypeScript implementation | Frontend developer, coding standards, clean code; performance guidance when a concrete performance risk exists |
| Backend/API changes | Backend development guidance; backend architecture for boundary/contract changes; API security for permission/input risks |
| Schema or slow queries | Database architecture for schema design, SQL optimization for measured query problems, plus the existing Supabase skills when applicable |
| Requested reviews | Code review, architecture review or static security analysis according to the requested scope |
| Planning and documents | Writing plans for multi-step work; spreadsheet, data storytelling or HTML slides only for the matching deliverable |
| Specialist tasks | React Flow only for graph interfaces, dark UI only for dark-theme work, modernization only for upgrades, prompt guides only for prompt requests, scientific overview only for scientific-tool discovery |

Apply context rather than copying examples blindly: this project's modular monolith, React/Vite/Tailwind, existing data access and brand rules take precedence over example microservices, MUI/TanStack Router, Prisma, new palettes or deployment choices. SQL plan claims and code snippets still require verification against the actual engine, data and current official documentation. Reading a guide is not authorization to execute its example commands, install its dependencies, expose logs or change live records.

## Change log

- 2026-10-16: Owner authorized applying the collection to Codex. Started a local, namespaced adaptation without changing the application or installing missing external packages.
- 2026-10-16: Installed and validated all 36 compatible entrypoints, preserved original content and added durable project selection guidance. Marked built with source-helper limitations disclosed.
- 2026-10-16: At the owner's request, completed a full reading of all 36 original guides and recorded task-based selection guidance. No application behavior changed.
