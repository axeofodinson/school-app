#!/usr/bin/env bash
# Keep newest KEEP_DAILY "daily-*" and KEEP_WEEKLY "weekly-*" releases in $BACKUP_REPO.
# Env: GH_TOKEN (backup-repo token), BACKUP_REPO
set -euo pipefail
: "${BACKUP_REPO:?}"; KEEP_DAILY="${KEEP_DAILY:-14}"; KEEP_WEEKLY="${KEEP_WEEKLY:-8}"
prune() { # prefix keep
  gh release list --repo "$BACKUP_REPO" --limit 500 --json tagName --jq '.[].tagName' \
    | grep "^$1-" | sort -r | tail -n +"$(($2 + 1))" \
    | while read -r tag; do echo "pruning $tag"; gh release delete "$tag" --repo "$BACKUP_REPO" --cleanup-tag --yes; done || true
}
prune daily "$KEEP_DAILY"
prune weekly "$KEEP_WEEKLY"
