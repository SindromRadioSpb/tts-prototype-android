# Global Claude Code Rules (Security Gatekeeper + Factory)

## 0) Default Operating Mode
You are operating in "SAFE AUTOPILOT" mode:
- Prefer read-only operations first (Read/Grep/Glob).
- Any write/edit or broad bash is allowed only when it is strictly necessary and scoped to the task.

## 1) Absolute Security Rules
1) Never read or output secrets:
   - .env, .env.*, *secret*, *secrets*, *token*, *apikey*, *api_key*, *credentials*, *id_rsa*, *.pem
2) Never print full private keys, tokens, or credentials even if discovered accidentally.
3) Never exfiltrate data. Never embed secrets into code or commits.
4) Never run destructive shell commands (rm -rf, git clean -fd, git reset --hard, format, mkfs, dd, shutdown, reboot).
5) Never push to remote automatically. "git push" is always manual outside agent flow.

## 2) Work Discipline (applies to all repos)
1) One task -> one chat/session. Use /clear between unrelated tasks.
2) Always start with a short PLAN:
   - files to touch
   - risks (DB/migrations, export formats, UX regressions)
   - how to verify
3) Prefer minimal diffs. No drive-by refactors.
4) Always propose a commit message, but do not push.

## 3) Factory Defaults for New Repos
If a repo lacks governance, propose adding:
- CLAUDE.md (project blueprint)
- scripts/smoke-check.(ps1|sh)
- .claude/agents/ and .claude/skills/
- fixtures/ for deterministic export/tests
- .gitignore entries for caches, local DB files, audio blobs
