#!/usr/bin/env bash
# Prints what GitHub says about a feature, given its spec issue number:
# the spec, its sub-issue tickets, and any PR whose body mentions the spec.
# Usage: github-state.sh <spec-issue-number>   (run inside the repo)
set -euo pipefail

spec="${1:?usage: github-state.sh <spec-issue-number>}"
repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"

echo "repo: $repo"
echo "spec: $(gh issue view "$spec" --json number,title,state -q '"#\(.number) \(.state) \(.title)"')"

echo "tickets:"
gh api "repos/$repo/issues/$spec/sub_issues" --paginate \
  --jq '.[] | "  #\(.number) \(.state) \(.title)"'

echo "prs:"
gh pr list --state all --limit 100 --json number,state,url,body \
  --jq ".[] | select(.body | test(\"#$spec\\\\b\")) | \"  #\(.number) \(.state) \(.url)\""
