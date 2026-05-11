#!/usr/bin/env bash
# Worktree helper: create or remove a worktree for an OrgFrame feature branch.
#
# Usage:
#   scripts/worktree.sh add <branch-name> [--new] [--port N]
#   scripts/worktree.sh rm  <branch-name>
#
# Examples:
#   scripts/worktree.sh add feature/org-dashboard
#   scripts/worktree.sh add feature/new-thing --new --port 3002
#   scripts/worktree.sh rm  feature/org-dashboard
#
# After 'add', the script:
#   1. Creates the worktree
#   2. Copies .env files
#   3. Runs npm install
#   4. Writes .vscode/tasks.json so the dev server auto-starts in the
#      integrated terminal when VS Code opens the folder
#   5. Opens VS Code
#   6. Waits for the dev server to respond, then opens Chrome

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
REPO_NAME="$(basename "$REPO_ROOT")"
PARENT_DIR="$(dirname "$REPO_ROOT")"

cmd="${1:-}"
branch="${2:-}"
shift 2 2>/dev/null || true

new_branch=false
port=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --new) new_branch=true; shift ;;
    --port) port="$2"; shift 2 ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

if [[ -z "$cmd" || -z "$branch" ]]; then
  echo "Usage: $0 add|rm <branch-name> [--new] [--port N]"
  exit 1
fi

# Find first free port starting from 3001
find_free_port() {
  local p=3001
  while lsof -iTCP:$p -sTCP:LISTEN >/dev/null 2>&1; do
    p=$((p + 1))
  done
  echo $p
}

# Derive a clean folder suffix from the branch (feature/foo-bar -> foo-bar)
suffix="${branch##*/}"
worktree_path="${PARENT_DIR}/${REPO_NAME}-${suffix}"

case "$cmd" in
  add)
    if [[ -d "$worktree_path" ]]; then
      echo "✗ $worktree_path already exists"
      exit 1
    fi

    echo "→ Creating worktree at $worktree_path"
    if [[ "$new_branch" == "true" ]]; then
      git -C "$REPO_ROOT" worktree add -b "$branch" "$worktree_path"
    else
      git -C "$REPO_ROOT" worktree add "$worktree_path" "$branch"
    fi

    echo "→ Copying .env files"
    while IFS= read -r envfile; do
      rel="${envfile#$REPO_ROOT/}"
      dest="$worktree_path/$rel"
      mkdir -p "$(dirname "$dest")"
      cp "$envfile" "$dest"
      echo "   $rel"
    done < <(find "$REPO_ROOT" -name ".env*" \
      -not -path "*/node_modules/*" \
      -not -path "*/.next/*" \
      -not -path "*/.claude/*" \
      -not -path "*/dist/*")

    echo "→ Running npm install"
    (cd "$worktree_path" && npm install)

    [[ -z "$port" ]] && port=$(find_free_port)

    echo "→ Writing .vscode/tasks.json (auto-start dev server on folder open)"
    mkdir -p "$worktree_path/.vscode"
    cat > "$worktree_path/.vscode/tasks.json" <<EOF
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "dev:app",
      "type": "shell",
      "command": "PORT=$port npm run dev:app",
      "isBackground": true,
      "presentation": {
        "reveal": "always",
        "panel": "dedicated",
        "focus": false
      },
      "runOptions": { "runOn": "folderOpen" },
      "problemMatcher": []
    }
  ]
}
EOF
    cat > "$worktree_path/.vscode/settings.json" <<EOF
{
  "task.allowAutomaticTasks": "on"
}
EOF
    # Hide .vscode from git status in this worktree only
    exclude_dir="$REPO_ROOT/.git/worktrees/$suffix/info"
    mkdir -p "$exclude_dir" 2>/dev/null || true
    echo ".vscode/" >> "$exclude_dir/exclude" 2>/dev/null || true

    echo "→ Opening VS Code (dev server will start in the integrated terminal)"
    if command -v code >/dev/null 2>&1; then
      code "$worktree_path"
    else
      echo "   'code' not in PATH — open manually: $worktree_path"
    fi

    echo "→ Waiting for server to be ready on port $port"
    for i in {1..90}; do
      if curl -sSf "http://localhost:$port" >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done

    if curl -sSf "http://localhost:$port" >/dev/null 2>&1; then
      echo "→ Opening Chrome"
      open -a "Google Chrome" "http://orgframe.test:$port"
    else
      echo "⚠ Server didn't respond on http://localhost:$port within 90s."
      echo "   Check the VS Code terminal panel. First-time only: VS Code may"
      echo "   prompt 'Allow automatic tasks' — click Allow, then re-run the task."
    fi

    echo ""
    echo "✓ Done."
    echo "   Worktree:   $worktree_path"
    echo "   Dev URL:    http://orgframe.test:$port"
    echo "   Stop dev:   click the trash icon in VS Code's terminal panel"
    ;;

  rm)
    if [[ ! -d "$worktree_path" ]]; then
      echo "✗ $worktree_path does not exist"
      exit 1
    fi
    echo "→ Removing worktree at $worktree_path"
    git -C "$REPO_ROOT" worktree remove "$worktree_path" --force
    echo "✓ Done. Branch '$branch' is preserved — delete with: git branch -d $branch"
    ;;

  *)
    echo "Unknown command: $cmd (expected 'add' or 'rm')"
    exit 1
    ;;
esac
