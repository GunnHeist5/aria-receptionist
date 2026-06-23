# Overnight Build-and-Test Workflow

Leave a spec at night, wake up to a reviewed-and-tested implementation on a dev
branch. You decide whether to ship. Production is never touched.

## How to use it

1. **Write your spec** in [`TASK.md`](TASK.md) — what you want built, where it
   lives, and how you'll know it works (acceptance criteria). Be specific.
2. **Run it** (or let the schedule run it):
   ```bash
   ./overnight/run-overnight.sh
   ```
3. **In the morning**, read the latest report in [`reports/`](reports/):
   - what was built, test results, what's ready to ship, anything blocked.
4. **Review and ship yourself.** The work sits on a dev branch in a separate
   worktree. Nothing was pushed or deployed.

## What happens under the hood

- A fresh **git worktree** is created at `../overnight-runs/<timestamp>` on a new
  branch `overnight/<timestamp>`. Your main checkout is never modified.
- A **sandbox `.env`** (copied from [`.env.test`](../.env.test), dummy values
  only) is placed in the worktree — so the agent and any tests **cannot reach
  your real database, Stripe, Telegram, PandaDoc, or VPS**.
- A **headless Claude Code agent** reads [`AGENT_PROMPT.md`](AGENT_PROMPT.md) +
  your `TASK.md`, implements on the dev branch, writes tests under `tests/`, runs
  `npm test`, and writes `overnight/REPORT.md`.
- The runner commits the work to the dev branch (in the worktree) and copies the
  report to `overnight/reports/<timestamp>.md`. **No push, no deploy.**

## The safety model (why production is safe)

Four independent guardrails, any one of which is enough:
1. **No real credentials in scope** — the worktree's `.env` is dummy-only, so
   code literally can't authenticate to prod services.
2. **Isolated worktree + dev branch** — your working tree and `main` are
   untouched; nothing is pushed.
3. **No deploy path** — the runner never calls `pm2`, `ssh`, or the VPS.
4. **Explicit prohibitions** in the agent prompt (no prod, no live calls, no
   reading the real `.env`, mock external systems).

## Scheduling (optional)

The machine must be on and the `claude` CLI authenticated.

**Windows Task Scheduler** (runs nightly at 10pm):
```bat
schtasks /Create /SC DAILY /TN "OvernightBuild" /ST 22:00 ^
  /TR "\"C:\Program Files\Git\bin\bash.exe\" -lc \"cd /c/Users/Yi/.claude/sessions && ./overnight/run-overnight.sh\""
```
Remove with: `schtasks /Delete /TN "OvernightBuild" /F`

**Or just run it manually** before you step away.

## Permissions note

The runner uses `claude -p ... --dangerously-skip-permissions` so the agent can
work unattended without prompting. That flag is acceptable **here** only because
of the sandbox above (dummy creds, isolated worktree, dev branch, no deploy). If
you'd rather be more conservative, replace it in `run-overnight.sh` with an
allowlist, e.g.:
```bash
claude -p "$PROMPT" --permission-mode acceptEdits \
  --allowedTools "Edit,Write,Read,Grep,Glob,Bash(npm test),Bash(node:*),Bash(git add:*),Bash(git commit:*)"
```
Trade-off: safer, but the run may stall if it needs a command you didn't allow.

## Cleaning up old runs

Worktrees accumulate under `../overnight-runs/`. Once you've shipped or discarded
a run:
```bash
git worktree remove ../overnight-runs/<timestamp>
git branch -D overnight/<timestamp>   # if you don't want the branch
```
