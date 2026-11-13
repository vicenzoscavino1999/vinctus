#!/usr/bin/env bash
# Run only on the ephemeral GitHub Mac after the ios-release environment gate.
set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" != true || "${RUNNER_OS:-}" != macOS ]]; then
  echo 'This release script requires a GitHub-hosted macOS runner.' >&2
  exit 1
fi

for required in APPLE_TEAM_ID ASC_KEY_ID ASC_ISSUER_ID ASC_PRIVATE_KEY IOS_FIREBASE_PLIST_BASE64 BUILD_NUMBER; do
  if [[ -z "${!required:-}" ]]; then
    echo "Missing release setting: $required" >&2
    exit 1
  fi
done
if [[ ! "$APPLE_TEAM_ID" =~ ^[A-Z0-9]{10}$ || ! "$ASC_KEY_ID" =~ ^[A-Z0-9]{10}$ ]]; then
  echo 'Invalid Apple Team ID or App Store Connect key ID.' >&2
  exit 1
fi
if [[ ! "$BUILD_NUMBER" =~ ^[1-9][0-9]{0,3}(\.[0-9]{1,2}){0,2}$ ]]; then
  echo 'Use a new Apple build number, for example 2 or 2.1.' >&2
  exit 1
fi

release_dir="$(mktemp -d "$RUNNER_TEMP/vinctus-release.XXXXXX")"
app_dir="$GITHUB_WORKSPACE/ios-native/VinctusNative"
keychain_path="$release_dir/signing.keychain-db"
firebase_path="$app_dir/Resources/Firebase/GoogleService-Info-Prod.plist"
prod_local_path="$app_dir/Config/Prod.local.xcconfig"
cleanup() {
  security delete-keychain "$keychain_path" >/dev/null 2>&1 || true
  rm -f -- "$release_dir/AuthKey.p8" "$firebase_path" "$prod_local_path"
}
trap cleanup EXIT
export RELEASE_DIR="$release_dir"
export APP_DIR="$app_dir"

python3 - <<'PY'
import base64
import os
import pathlib
import plistlib
import uuid

uuid.UUID(os.environ['ASC_ISSUER_ID'])
release = pathlib.Path(os.environ['RELEASE_DIR'])
app = pathlib.Path(os.environ['APP_DIR'])
raw = base64.b64decode(os.environ['IOS_FIREBASE_PLIST_BASE64'], validate=True)
config = plistlib.loads(raw)
if config.get('BUNDLE_ID') != 'app.vinctus.social' or config.get('PROJECT_ID') != 'vinctus-daf32':
    raise SystemExit('Firebase config does not match Vinctus production.')
reversed_id = config.get('REVERSED_CLIENT_ID', '')
if not reversed_id.startswith('com.googleusercontent.apps.') or any(c.isspace() for c in reversed_id):
    raise SystemExit('Missing or invalid Google reversed client ID.')
key = release / 'AuthKey.p8'
key.write_text(os.environ['ASC_PRIVATE_KEY'], encoding='utf-8')
key.chmod(0o600)
(app / 'Resources/Firebase/GoogleService-Info-Prod.plist').write_bytes(raw)
(app / 'Config/Prod.local.xcconfig').write_text(
    f'GOOGLE_REVERSED_CLIENT_ID = {reversed_id}\n', encoding='utf-8')
with (release / 'ExportOptions.plist').open('wb') as file:
    plistlib.dump({
        'method': 'app-store-connect',
        'destination': 'upload',
        'signingStyle': 'automatic',
        'teamID': os.environ['APPLE_TEAM_ID'],
        'manageAppVersionAndBuildNumber': False,
        'uploadSymbols': True,
    }, file)
PY

openssl pkey -in "$release_dir/AuthKey.p8" -check -noout >/dev/null
unset ASC_PRIVATE_KEY IOS_FIREBASE_PLIST_BASE64
keychain_password="$(openssl rand -hex 24)"
echo "::add-mask::$keychain_password"
security create-keychain -p "$keychain_password" "$keychain_path"
security set-keychain-settings -lut 7200 "$keychain_path"
security unlock-keychain -p "$keychain_password" "$keychain_path"
security list-keychains -d user -s "$keychain_path" "$HOME/Library/Keychains/login.keychain-db"
security default-keychain -d user -s "$keychain_path"

auth=(
  -allowProvisioningUpdates
  -authenticationKeyPath "$release_dir/AuthKey.p8"
  -authenticationKeyID "$ASC_KEY_ID"
  -authenticationKeyIssuerID "$ASC_ISSUER_ID"
)
cd "$app_dir"
xcodegen generate
xcodebuild archive \
  -project VinctusNative.xcodeproj \
  -scheme VinctusNative-Prod \
  -configuration ReleaseProd \
  -destination 'generic/platform=iOS' \
  -archivePath "$release_dir/VinctusNative.xcarchive" \
  -clonedSourcePackagesDirPath "$release_dir/spm" \
  "${auth[@]}" \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  -quiet
xcodebuild -exportArchive \
  -archivePath "$release_dir/VinctusNative.xcarchive" \
  -exportOptionsPlist "$release_dir/ExportOptions.plist" \
  -exportPath "$release_dir/export" \
  "${auth[@]}" \
  -quiet

{
  echo '### Vinctus uploaded to App Store Connect'
  echo "Commit: $GITHUB_SHA"
  echo "Build: $BUILD_NUMBER"
  echo 'Wait for Apple processing, then select the build in TestFlight.'
  echo 'App Store review and public release are separate steps.'
} >> "$GITHUB_STEP_SUMMARY"
