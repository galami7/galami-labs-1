#!/bin/bash
# After the project sits unchanged for a short while, commit and push main.
# Vercel then publishes that push to https://galamilabs.com.
set -u

REPO="/Users/guillaumeg/Galami Labs"
cd "$REPO" || exit 0

export PATH="/Users/guillaumeg/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="${HOME:-/Users/guillaumeg}"
VERCEL="/Users/guillaumeg/.npm-global/bin/vercel"
PROJECT_ID="prj_AsnpRn0cE20N6E8ODKo4o8RTzsi3"

publish_production() {
  local sha="$1"
  sleep 20
  local existing
  existing="$("$VERCEL" api "/v6/deployments?projectId=${PROJECT_ID}&limit=8" 2>/dev/null | /usr/bin/python3 -c '
import json, sys
raw = sys.stdin.read()
start = raw.find("{")
if start < 0:
    sys.exit(0)
data = json.loads(raw[start:])
sha = sys.argv[1]
for item in data.get("deployments", []):
    meta = item.get("meta") or {}
    if meta.get("githubCommitSha") == sha:
        print(item.get("url") or "yes")
        break
' "$sha")"
  if [ -n "$existing" ]; then
    log "production deployment already started for ${sha:0:7}"
    return 0
  fi
  if "$VERCEL" api /v13/deployments -X POST --input - <<EOF
{
  "name": "galami-labs",
  "project": "${PROJECT_ID}",
  "target": "production",
  "gitSource": {
    "type": "github",
    "repoId": 1407958110,
    "ref": "${sha}"
  }
}
EOF
  then
    log "requested production deployment for ${sha:0:7}"
  else
    log "could not request production deployment for ${sha:0:7}"
  fi
}

WAIT="${AUTOSHIP_WAIT:-30}"
LOCK="$REPO/.git/autoship.lock"
STATE="$REPO/.git/autoship-state"
LOG="$REPO/.git/autoship.log"

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG"
}

if [ -f "$REPO/.git/autoship-paused" ]; then
  exit 0
fi

if ! mkdir "$LOCK" 2>/dev/null; then
  exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

if [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ] || [ -f .git/MERGE_HEAD ] || [ -f .git/index.lock ]; then
  exit 0
fi

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
if [ "$branch" != "main" ]; then
  exit 0
fi

now="$(date +%s)"
status="$(git status --porcelain)"

if [ -n "$status" ]; then
  hash="$(printf '%s' "$status" | shasum -a 256 | awk '{print $1}')"
  prev_hash=""
  prev_time=""
  if [ -f "$STATE" ]; then
    prev_hash="$(sed -n '1p' "$STATE")"
    prev_time="$(sed -n '2p' "$STATE")"
  fi

  if [ "$prev_hash" != "$hash" ] || ! [[ "$prev_time" =~ ^[0-9]+$ ]]; then
    printf '%s\n%s\n' "$hash" "$now" > "$STATE"
    exit 0
  fi

  if [ $((now - prev_time)) -lt "$WAIT" ]; then
    exit 0
  fi

  git add -A
  if ! git diff --cached --quiet; then
    files=()
    while IFS= read -r line; do
      [ -n "$line" ] && files+=("$line")
    done < <(git diff --cached --name-only)
    n="${#files[@]}"
    if [ "$n" -eq 1 ]; then
      msg="Update ${files[0]}."
    elif [ "$n" -eq 2 ]; then
      msg="Update ${files[0]} and ${files[1]}."
    elif [ "$n" -eq 3 ]; then
      msg="Update ${files[0]}, ${files[1]}, and ${files[2]}."
    else
      msg="Publish the latest site edits."
    fi
    if ! git commit -m "$msg"; then
      log "commit failed"
      exit 0
    fi
    log "committed: $msg"
  fi
  rm -f "$STATE"
fi

ahead="$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)"
if [ "$ahead" = "0" ]; then
  exit 0
fi

sha="$(git rev-parse HEAD)"
if git push origin main; then
  log "pushed ${ahead} commit(s) to origin/main"
  publish_production "$sha"
  exit 0
fi

log "push failed; trying rebase"
if git pull --rebase --autostash origin main && git push origin main; then
  log "pushed after rebase"
  publish_production "$(git rev-parse HEAD)"
else
  log "push still failed"
fi
