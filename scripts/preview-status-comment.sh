#!/usr/bin/env bash
# Post or update the one-per-PR preview-alias status comment.
# Usage: preview-status-comment.sh <pr-number> <status> <error> <preview-url>
#   status: "success" or "failure"
# Requires GH_TOKEN and GITHUB_REPOSITORY (both set automatically by Actions).
set -euo pipefail

PR_NUMBER="${1:?pr-number required}"
STATUS="${2:?status required (success|failure)}"
ERROR="${3:-}"
PREVIEW_URL="${4:-}"
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"

if [ "$STATUS" = "success" ]; then
  BODY="$(printf '%s\n' \
    "## 🚀 Preview aliased" \
    "" \
    "[**preview.lqh2011.com**](https://preview.lqh2011.com) now points to this PR's latest preview - no more blocked *.vercel.app URLs from China." \
    "" \
    "- 📦 **Deployment:** [$PREVIEW_URL]($PREVIEW_URL)" \
    "- 🕒 **Updated:** $(date -u '+%Y-%m-%d %H:%M UTC')" \
    "" \
    '<sub>🤖 posted by the *Alias Vercel Preview* workflow · <!-- preview-alias-status --></sub>')"
else
  BODY="$(printf '%s\n' \
    "## ⚠️ Preview alias failed" \
    "" \
    "[**preview.lqh2011.com**](https://preview.lqh2011.com) could not be updated for this preview." \
    "" \
    "- 📦 **Deployment:** [$PREVIEW_URL]($PREVIEW_URL)" \
    "- ❌ **Error:** \`${ERROR:-unknown error}\`" \
    "- 🛠️ **Fix:** check that the \`VERCEL_TOKEN\` secret is a classic Full Account token and that \`preview.lqh2011.com\` is added in Vercel → Settings → Domains (README → Deploy → 5)." \
    "" \
    '<sub>🤖 posted by the *Alias Vercel Preview* workflow · <!-- preview-alias-status --></sub>')"
fi

# Upsert: keep ONE comment per PR (marker hidden in the footer). List ALL
# pages (--paginate; jq runs per page, ids collected in the shell), keep the
# NEWEST bot-authored comment carrying the marker, and delete any duplicates
# left over from races or older versions. NOTE: gh's --slurp cannot be
# combined with --jq.
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
printf '%s' "$BODY" | jq -Rs '{body: .}' > "$TMP"

IDS="$(gh api --paginate \
  "repos/${REPO}/issues/${PR_NUMBER}/comments?per_page=100" \
  --jq '.[] | select(.user.login == "github-actions[bot]" and (.body | contains("preview-alias-status"))) | .id' \
  | sort -n)"
EXISTING_ID="$(printf '%s' "$IDS" | tail -1)"
for dup in $(printf '%s' "$IDS" | head -n -1); do
  echo "Deleting duplicate status comment ${dup}"
  gh api -X DELETE "repos/${REPO}/issues/comments/${dup}" >/dev/null
done

if [ -n "$EXISTING_ID" ]; then
  echo "Updating existing comment ${EXISTING_ID}"
  gh api -X PATCH "repos/${REPO}/issues/comments/${EXISTING_ID}" --input "$TMP" >/dev/null
else
  echo "Posting new comment on PR #${PR_NUMBER}"
  gh api -X POST "repos/${REPO}/issues/${PR_NUMBER}/comments" --input "$TMP" >/dev/null
fi
echo "Status comment: https://github.com/${REPO}/pull/${PR_NUMBER}"
