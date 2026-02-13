#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_PATH="$ROOT_DIR/ios-native/VinctusNative/VinctusNative.xcodeproj"
SCHEME="${SCHEME:-VinctusNative-Dev}"
CONFIG="${CONFIG:-DebugDev}"
SIMULATOR_NAME="${SIMULATOR_NAME:-iPhone 17 Pro}"
BUNDLE_ID="${BUNDLE_ID:-app.vinctus.social}"
DERIVED_DATA="${DERIVED_DATA:-/tmp/vinctus-ios-dev}"

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

if [ -n "${SIMULATOR_ID:-}" ]; then
  DEVICE_ID="$SIMULATOR_ID"
else
  DEVICE_ID="$(xcrun simctl list devices available | awk -v name="$SIMULATOR_NAME" '
    $0 ~ name {
      if (match($0, /\(([A-F0-9-]+)\)/)) {
        print substr($0, RSTART + 1, RLENGTH - 2);
        exit;
      }
    }'
  )"
fi

if [ -z "$DEVICE_ID" ]; then
  echo "No simulator found for name: $SIMULATOR_NAME"
  echo "Tip: set SIMULATOR_ID=<UDID> before running this script."
  exit 1
fi

echo "Using simulator: $DEVICE_ID"
xcrun simctl boot "$DEVICE_ID" >/dev/null 2>&1 || true

echo "Building $SCHEME ($CONFIG)..."
xcodebuild \
  -project "$PROJECT_PATH" \
  -scheme "$SCHEME" \
  -configuration "$CONFIG" \
  -destination "platform=iOS Simulator,id=$DEVICE_ID" \
  -derivedDataPath "$DERIVED_DATA" \
  build

APP_PATH="$DERIVED_DATA/Build/Products/${CONFIG}-iphonesimulator/VinctusNative.app"
if [ ! -d "$APP_PATH" ]; then
  APP_PATH="$(find "$DERIVED_DATA/Build/Products" -maxdepth 2 -name "VinctusNative.app" | head -n 1)"
fi

if [ -z "$APP_PATH" ] || [ ! -d "$APP_PATH" ]; then
  echo "Built app not found in derived data path: $DERIVED_DATA"
  exit 1
fi

echo "Installing app: $APP_PATH"
xcrun simctl install "$DEVICE_ID" "$APP_PATH"

echo "Launching $BUNDLE_ID"
xcrun simctl launch "$DEVICE_ID" "$BUNDLE_ID"

echo "Done."
