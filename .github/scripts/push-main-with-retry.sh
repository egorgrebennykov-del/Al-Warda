#!/usr/bin/env bash
set -euo pipefail

for attempt in 1 2 3 4 5; do
  git fetch origin main
  if ! git rebase origin/main; then
    git rebase --abort
    echo "::error::Could not rebase generated changes onto main; resolve the conflict manually."
    exit 1
  fi
  if git push origin HEAD:main; then
    exit 0
  fi
  echo "Push failed on attempt $attempt of 5; fetching main and retrying."
  if [ "$attempt" -lt 5 ]; then
    sleep "$attempt"
  fi
done

echo "::error::Could not push changes to main after 5 attempts."
exit 1
