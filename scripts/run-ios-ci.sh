#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_PATH="$ROOT_DIR/ios-native/VinctusNative/VinctusNative.xcodeproj"
SCHEME="${SCHEME:-VinctusNative-Dev}"
CONFIG="${CONFIG:-DebugDev}"
DERIVED_DATA="${DERIVED_DATA:-/tmp/vinctus-ios-ci}"

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "xcodebuild not found. Install Xcode command line tools."
  exit 1
fi

if ! command -v xcrun >/dev/null 2>&1; then
  echo "xcrun not found. Install Xcode command line tools."
  exit 1
fi

if [ ! -d "$PROJECT_PATH" ]; then
  echo "Xcode project not found: $PROJECT_PATH"
  exit 1
fi

extract_udid() {
  sed -E 's/.*\(([A-Fa-f0-9-]+)\).*/\1/'
}

resolve_device_id() {
  if [ -n "${SIMULATOR_ID:-}" ]; then
    echo "$SIMULATOR_ID"
    return
  fi

  local requested_name="${SIMULATOR_NAME:-}"
  if [ -n "$requested_name" ]; then
    local requested_id=""
    requested_id="$(
      xcrun simctl list devices available \
        | grep -F " $requested_name (" \
        | head -n 1 \
        | extract_udid || true
    )"
    if [ -n "$requested_id" ]; then
      echo "$requested_id"
      return
    fi
  fi

  local preferred_names=(
    "iPhone 17 Pro"
    "iPhone 16 Pro"
    "iPhone 15 Pro"
    "iPhone 14 Pro"
    "iPhone 13 Pro"
    "iPhone 16"
    "iPhone 15"
    "iPhone 14"
  )

  local name=""
  local candidate_id=""
  for name in "${preferred_names[@]}"; do
    candidate_id="$(
      xcrun simctl list devices available \
        | grep -F " $name (" \
        | head -n 1 \
        | extract_udid || true
    )"
    if [ -n "$candidate_id" ]; then
      echo "$candidate_id"
      return
    fi
  done

  # Final fallback: first available iPhone simulator in the host.
  xcrun simctl list devices available \
    | grep -E "iPhone .*\([A-Fa-f0-9-]+\) \((Booted|Shutdown)\)" \
    | head -n 1 \
    | extract_udid || true
}

DEVICE_ID="$(resolve_device_id)"
if [ -z "$DEVICE_ID" ]; then
  echo "No available iPhone simulator found."
  exit 1
fi

echo "Using simulator: $DEVICE_ID"
xcrun simctl boot "$DEVICE_ID" >/dev/null 2>&1 || true

echo "Building for testing: $SCHEME ($CONFIG)"
xcodebuild \
  -project "$PROJECT_PATH" \
  -scheme "$SCHEME" \
  -configuration "$CONFIG" \
  -destination "platform=iOS Simulator,id=$DEVICE_ID" \
  -derivedDataPath "$DERIVED_DATA" \
  build-for-testing

echo "Running tests: $SCHEME ($CONFIG)"
xcodebuild \
  -project "$PROJECT_PATH" \
  -scheme "$SCHEME" \
  -configuration "$CONFIG" \
  -destination "platform=iOS Simulator,id=$DEVICE_ID" \
  -derivedDataPath "$DERIVED_DATA" \
  test-without-building

echo "iOS CI gates passed."
