#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_PATH="${SWIFTLINT_CONFIG:-$ROOT_DIR/.swiftlint.yml}"

if ! command -v swiftlint >/dev/null 2>&1; then
  echo "swiftlint not found. Install with 'brew install swiftlint'."
  exit 1
fi

if [ ! -f "$CONFIG_PATH" ]; then
  echo "SwiftLint config not found: $CONFIG_PATH"
  exit 1
fi

echo "Running SwiftLint with config: $CONFIG_PATH"
cd "$ROOT_DIR"
swiftlint lint --strict --config "$CONFIG_PATH"
