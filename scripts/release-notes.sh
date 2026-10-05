#!/usr/bin/env bash
set -euo pipefail

tag=${1:?release tag required}
output=${2:?output file required}
previous_stable=$(
  git tag --merged HEAD --list 'v[0-9]*' |
    grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' |
    grep -Fvx "$tag" |
    sort -V |
    tail -n 1 || true
)

# Keep RC changes in the eventual stable notes, and show the full candidate
# delta from the last stable version even if several RCs have been tagged.
if [[ -n "$previous_stable" ]]; then
  git-cliff --config cliff.toml --tag-pattern '^$' --ignore-tags '^$' \
    --tag "$tag" --output "$output" "$previous_stable..HEAD"
else
  git-cliff --config cliff.toml --tag-pattern '^$' --ignore-tags '^$' \
    --tag "$tag" --output "$output"
fi
