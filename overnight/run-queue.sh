#!/usr/bin/env bash
set -uo pipefail

# Overnight queue loop.
#
# Continuously processes task specs from overnight/queue/*.md. For each task:
#   isolated git worktree on a fresh dev branch + sandbox .env (dummy creds)
#   -> headless Claude Code agent implements & tests it -> records result ->
#   moves the spec to done/ or failed/ -> next task. When the queue is empty it
#   idles and polls for new tasks. NEVER deploys or touches production.
#
# Usage:
#   ./overnight/run-queue.sh           # loop forever, idling when empty
#   ./overnight/run-queue.sh --once    # drain the current queue, then exit
#   IDLE_SECONDS=30 ./overnight/run-queue.sh
#
# Add work by dropping .md spec files into overnight/queue/ (any time, even
# while it's running). Numeric prefixes set order, e.g. 01-foo.md, 02-bar.md.

REPO="$(git rev-parse --show-toplevel)"; cd "$REPO"
Q="$REPO/overnight/queue"; DONE="$Q/done"; FAILED="$Q/failed"; PROC="$Q/processing"
REPORTS="$REPO/overnight/reports"; PROMPT_FILE="$REPO/overnight/AGENT_PROMPT.md"
SUMMARY="$REPORTS/SUMMARY.md"
IDLE_SECONDS="${IDLE_SECONDS:-60}"
ONCE=0; [[ "${1:-}" == "--once" ]] && ONCE=1

mkdir -p "$Q" "$DONE" "$FAILED" "$PROC" "$REPORTS" "$REPO/../overnight-runs"
command -v claude >/dev/null 2>&1 || { echo "[queue] 'claude' CLI not found." >&2; exit 1; }
[[ -f "$SUMMARY" ]] || printf '# Overnight Queue Summary\n\n| When | Task | Status | Branch | Report |\n|---|---|---|---|---|\n' > "$SUMMARY"

trap 'echo "[queue] stopping."; exit 0' INT TERM

process_one() {
  local task="$1"
  local base; base="$(basename "$task" .md)"
  local ts; ts="$(date +%Y%m%d-%H%M%S)"
  local slug; slug="$(echo "$base" | tr -cs 'a-zA-Z0-9' '-' | sed 's/^-*//;s/-*$//' | cut -c1-30)"
  local branch="overnight/$ts-$slug"
  local wt="$REPO/../overnight-runs/$ts-$slug"
  local log="$REPORTS/$ts-$slug.log"
  local report="$REPORTS/$ts-$slug.md"

  echo "[queue] processing '$base' -> $branch"
  if ! git worktree add -b "$branch" "$wt" HEAD >/dev/null 2>&1; then
    echo "[queue] worktree create failed for '$base'; moving to failed/" >&2
    mv "$task" "$FAILED/" 2>/dev/null || true
    return 1
  fi
  [[ -f "$REPO/.env.test" ]] && cp "$REPO/.env.test" "$wt/.env"

  local prompt
  prompt="$(cat "$PROMPT_FILE")

# ===================== TASK SPEC =====================
$(cat "$task")
"
  ( cd "$wt" && claude -p "$prompt" --dangerously-skip-permissions ) > "$log" 2>&1 || true
  ( cd "$wt" && git add -A && git commit -m "overnight $ts: $base" >/dev/null 2>&1 || true )

  local status="NEEDS-REVIEW"
  [[ -f "$wt/overnight/STATUS" ]] && status="$(head -n1 "$wt/overnight/STATUS" | tr -d '[:space:]')"
  if [[ -f "$wt/overnight/REPORT.md" ]]; then cp "$wt/overnight/REPORT.md" "$report"; else echo "(no report produced; see $(basename "$log"))" > "$report"; fi

  if [[ "$status" == "PASS" ]]; then mv "$task" "$DONE/" 2>/dev/null || true
  else mv "$task" "$FAILED/" 2>/dev/null || true; fi

  printf '| %s | %s | %s | `%s` | overnight/reports/%s |\n' \
    "$(date '+%Y-%m-%d %H:%M')" "$base" "$status" "$branch" "$(basename "$report")" >> "$SUMMARY"
  echo "[queue] '$base' -> $status   (review: git -C \"$wt\" diff main...$branch)"
}

echo "[queue] watching overnight/queue/  (idle ${IDLE_SECONDS}s, $([[ $ONCE == 1 ]] && echo 'drain-once' || echo 'loop forever'))"
while true; do
  next="$(find "$Q" -maxdepth 1 -name '*.md' -type f | sort | head -n1)"
  if [[ -z "$next" ]]; then
    if [[ "$ONCE" == "1" ]]; then echo "[queue] queue empty; exiting (--once)."; break; fi
    sleep "$IDLE_SECONDS"; continue
  fi
  locked="$PROC/$(basename "$next")"
  mv "$next" "$locked" 2>/dev/null || continue   # lock; skip if another worker grabbed it
  process_one "$locked"
done
