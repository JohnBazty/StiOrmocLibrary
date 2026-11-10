// PreToolUse guard for Bash and PowerShell: refuses commands that can delete untracked or ignored files
// (apps/api/.env, .vercel/, runtime uploads in apps/storage/ and apps/api/public/assets/covers/ are not in git
// and cannot be restored). Copied from STI ILMS REA, where a `git worktree remove --force` followed junctions
// into node_modules and deleted apps/api/.env on 2026-11-04. Exit 0 with a deny decision; any other input passes.
import { readFileSync } from 'node:fs'

const RULES = [
  [/\bgit\s+worktree\b/i, 'git worktree (removing a worktree follows Windows junctions and deletes their targets)'],
  [/\bgit\s+clean\b/i, 'git clean (deletes untracked files)'],
  [/\bgit\s+stash\b[^\n;&|]*\s(-u|--include-untracked|-a|--all)\b/i, 'git stash with untracked files'],
  [/\bgit\s+reset\b[^\n;&|]*--hard\b/i, 'git reset --hard'],
  [/\bgit\s+(checkout|restore)\b[^\n;&|]*\s(--\s+)?\.(\s|$|;|&|\|)/i, 'git checkout/restore of the whole tree'],
  [/\brm\s+(-[a-z]*r[a-z]*|--recursive)\b/i, 'rm -r / rm -rf'],
  [/\bRemove-Item\b[^\n;|]*-Recurse\b/i, 'Remove-Item -Recurse'],
  [/\b(rmdir|rd)\s+[^\n;&|]*\/s\b/i, 'rmdir /s'],
  [/\bdel\s+[^\n;&|]*\/s\b/i, 'del /s'],
  [/\bmklink\s+\/[jd]\b/i, 'mklink /J or /D (junctions make recursive deletes reach the target)'],
  [/\bNew-Item\b[^\n;|]*-ItemType\s+['"]?(Junction|SymbolicLink)\b/i, 'New-Item Junction/SymbolicLink'],
]

let command = ''
try {
  command = String(JSON.parse(readFileSync(0, 'utf8'))?.tool_input?.command ?? '')
} catch {
  process.exit(0)
}
const hit = RULES.find(([pattern]) => pattern.test(command))
if (hit) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Blocked by .claude/hooks/guard-destructive.mjs: ${hit[1]}. This checkout holds files that are not in git (apps/api/.env, .vercel/, uploads in apps/storage/ and apps/api/public/assets/covers/). To compare with old code use "git stash push <tracked paths>" or "git show <commit>:<path>". If the deletion is really needed, ask Ethan to run it himself.`,
    },
  }))
}
