# Caveman project skill installation

| Field | Value |
| --- | --- |
| Date created | 2026-10-16 |
| Date last updated | 2026-10-16 |
| Status | `built` |

## Why

The owner requested Caveman in this project to reduce token use. Installed its instruction-only concise-response skill as a repository skill. This helps reduce response length; it does not impose a hard token budget or guarantee a savings percentage. Tool outputs, context, code and reasoning also contribute to usage.

## How

- Source: https://github.com/JuliusBrussee/caveman
- Pinned commit: `d262ab3882952a59312ff3537cd86d894523c5ab`.
- Installed directory: `.agents/skills/caveman/` using the bundled Codex skill-installer with an explicit project destination.
- Reviewed the upstream SKILL.md and its README, licensing and notices before installation. The skill and README remain unchanged. Copied upstream LICENSE, LICENSE-MIT, NOTICE and LICENSING.md into that directory to preserve attribution and licensing.
- Updated the existing project AGENTS.md to use concise replies by default, retaining understandable language, necessary updates, factual verification and detailed explanations/documents when needed. Higher-priority instructions continue to govern.
- Codex discovers repository skills in `.agents/skills`. Available on the next turn; if it does not appear, restart Codex. Explicitly request `$caveman` to select the skill. Say `normal mode` or `stop caveman` to stop the concise mode in the current conversation. To change the repository default permanently, ask to remove its AGENTS.md preference.
- Ultra/Wenyan sibling modes are not installed; do not claim their availability. The included upstream README mentions these as upstream alternatives.

Only the style skill is installed. No upstream installer/runtime was executed, no proxy/server/hooks or model routing were configured, no credentials were accessed and no global Codex settings changed. Existing app dependencies, code, database, model selection and project work remain unchanged. No push/deployment.

## Implementation tracking

- [x] Inspect upstream skill, installation and licensing instructions.
- [x] Confirm Codex repository skill discovery using official documentation.
- [x] Install pinned skill into the project and preserve licensing.
- [x] Compare installed SKILL.md with pinned upstream content.
- [x] Record activation and limits; preserve existing repository instructions.

## Verification

Installer completed successfully. Installed SKILL.md matches the inspected pinned upstream version exactly and contains the required name/description frontmatter. The installed directory contains instruction/documentation/license files only; no executable runtime, dependency installation, telemetry or API proxy was added. Actual host discovery is checked on a subsequent turn; byte validation alone does not prove host activation or measured savings.

## Change log

- 2026-10-16: Installed the project-scoped Caveman style skill at the owner's request, verified source identity, retained licenses and added concise-reply preference. No product schema change; Postgres 026/next 027 and MySQL reference 048/next 049 unchanged.
