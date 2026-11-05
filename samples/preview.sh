#!/usr/bin/env bash
set -eu

# Compare shell parameters, expansions, arrays, patterns, and command syntax.
readonly DEFAULT_ACCENT='#297aa0'
roles=(background foreground accent)

describe_theme() {
  local name="${1:-Themer Lab}"
  local accent="${2:-$DEFAULT_ACCENT}"
  local index=0
  local role

  case "$accent" in
    \#??????) printf 'Theme: %s (%s)\n' "$name" "$accent" ;;
    *) printf 'Expected a six-digit accent.\n' >&2; return 1 ;;
  esac

  for role in "${roles[@]}"; do
    ((index += 1))
    if [[ "$role" == 'accent' ]]; then
      printf '%d. %-10s = %s\n' "$index" "$role" "$accent"
    else
      printf '%d. %-10s = %s\n' "$index" "$role" '#bfbfbf'
    fi
  done
}

describe_theme "${1:-Themer Lab}" "${2:-$DEFAULT_ACCENT}"
