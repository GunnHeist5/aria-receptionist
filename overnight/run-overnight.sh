#!/usr/bin/env bash
set -uo pipefail

# Overnight build-and-test runner.
#
# Reads overnight/TASK.md and, in an ISOLATED git worktree on a fresh dev branch
# with a SANDBOX .env (dummy credentials only), launches a headless Claude Code
# agent to implement + test the task. Writes a morning report. Never deploys,
# never pushes to main, never touches production.
#
# Usage:  ./overnight/run-overnight.sh
# Schedule it (see overnight/README.md) or just run it before bed.

REPO="$(git rev-parse --show-toplevel)"
cd "$REPO"

TASK_FILE="$REPO/overnight/TASK.md"
PROMPT_FILE="$REPO/overnight/AGENT_PROMPT.md"
REPORTS="$REPO/overnight/reports"

# --- Preconditions -----------------------------------------------------------
if [[ ! -s "$TASK_FILE" ]]; then
  echo "[overnight] No task. Write your spec in overnight/TASK.md first." >&2
  exit 1
fi
if ! command -v claude >/dev/null 2>&1; then
  echo "[overnight] 'claude' CLI not found on PATH." >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "[overnight] Working tree is dirty. Commit or stash before running." >&2
  exit 1
fi

TS="$(date +%Y%m%d-%H%M%S)"
BRANCH="overnight/$TS"
WT="$REPO/../overnight-runs/$TS"
LOG="$REPORTS/$TS.log"
mkdir -p "$REPORTS" "$REPO/../overnight-runs"

echo "[overnight] worktree: $WT"
echo "[overnight] branch:   $BRANCH"
git worktree add -b "$BRANCH" "$WT" HEAD >/dev/null

# Sandbox env — dummy creds only, so the agent cannot reach production.
if [[ -f "$REPO/.env.test" ]]; then
  cp "$REPO/.env.test" "$WT/.env"
else
  echo "[overnight] WARNING: no .env.test found; running with no .env." >&2
fi

PROMPT="$(cat "$PROMPT_FILE")

# ===================== TASK SPEC (from overnight/TASK.md) =====================
$(cat "$TASK_FILE")
"

echo "[overnight] launching headless agent — log: overnight/reports/$TS.log"
cd "$WT"

# Headless / unattended. Safe by construction: isolated worktree, dummy .env,
# dedicated dev branch, no push. See overnight/README.md for the safety model.
claude -p "$PROMPT" --dangerously-skip-permissions 2>&1 | tee "$LOG" || true

# Commit whatever the agent produced — on the dev branch, in the worktree only.
git add -A
git commit -m "overnight $TS: see overnight/REPORT.md" >/dev/null 2>&1 || true

# Surface the report back in the main checkout for easy morning review.
if [[ -f "$WT/overnight/REPORT.md" ]]; then
  cp "$WT/overnight/REPORT.md" "$REPORTS/$TS.md"
  echo "[overnight] report: overnight/reports/$TS.md"
else
  echo "[overnight] No REPORT.md produced — check overnight/reports/$TS.log" >&2
fi

echo "[overnight] done."
echo "  Review the work:  git -C \"$WT\" log --oneline -n 20"
echo "                    git -C \"$WT\" diff main...$BRANCH"
echo "  Report:           overnight/reports/$TS.md"
echo "  Nothing was pushed or deployed. Shipping is your call."
