#!/usr/bin/env bash
# Run only on the ephemeral GitHub Mac after the ios-release environment gate.
set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" != true || "${RUNNER_OS:-}" != macOS ]]; then
  echo 'This release script requires a GitHub-hosted macOS runner.' >&2
  exit 1
fi

for required in APPLE_TEAM_ID ASC_KEY_ID ASC_ISSUER_ID ASC_PRIVATE_KEY IOS_FIREBASE_PLIST_BASE64 IOS_DISTRIBUTION_P12_BASE64 IOS_DISTRIBUTION_P12_PASSWORD IOS_PROVISIONING_PROFILE_BASE64 BUILD_NUMBER; do
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
installed_profiles=()
cleanup() {
  security default-keychain -d user -s "$HOME/Library/Keychains/login.keychain-db" >/dev/null 2>&1 || true
  security delete-keychain "$keychain_path" >/dev/null 2>&1 || true
  for installed_profile in "${installed_profiles[@]}"; do
    rm -f -- "$installed_profile"
  done
  rm -f -- "$release_dir/AuthKey.p8" "$release_dir/distribution.p12" "$release_dir/distribution.mobileprovision" "$firebase_path" "$prod_local_path"
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
for name, variable in [
    ('distribution.p12', 'IOS_DISTRIBUTION_P12_BASE64'),
    ('distribution.mobileprovision', 'IOS_PROVISIONING_PROFILE_BASE64'),
]:
    target = release / name
    target.write_bytes(base64.b64decode(os.environ[variable], validate=True))
    target.chmod(0o600)
PY

openssl pkey -in "$release_dir/AuthKey.p8" -check -noout >/dev/null
unset ASC_PRIVATE_KEY IOS_FIREBASE_PLIST_BASE64 IOS_DISTRIBUTION_P12_BASE64 IOS_PROVISIONING_PROFILE_BASE64
keychain_password="$(openssl rand -hex 24)"
echo "::add-mask::$keychain_password"
security create-keychain -p "$keychain_password" "$keychain_path"
security set-keychain-settings -lut 7200 "$keychain_path"
security unlock-keychain -p "$keychain_password" "$keychain_path"
security list-keychains -d user -s "$keychain_path" "$HOME/Library/Keychains/login.keychain-db"
security default-keychain -d user -s "$keychain_path"
security import "$release_dir/distribution.p12" -k "$keychain_path" \
  -P "$IOS_DISTRIBUTION_P12_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security >/dev/null
unset IOS_DISTRIBUTION_P12_PASSWORD
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$keychain_password" "$keychain_path" >/dev/null
security cms -D -i "$release_dir/distribution.mobileprovision" > "$release_dir/profile.plist"

python3 - <<'PY'
import datetime
import hashlib
import os
import pathlib
import plistlib
import uuid

release = pathlib.Path(os.environ['RELEASE_DIR'])
with (release / 'profile.plist').open('rb') as file:
    profile = plistlib.load(file)
team = os.environ['APPLE_TEAM_ID']
entitlements = profile.get('Entitlements', {})
if profile.get('TeamIdentifier') != [team] or entitlements.get('application-identifier') != f'{team}.app.vinctus.social':
    raise SystemExit('Provisioning profile does not match the Vinctus team and bundle.')
if 'ProvisionedDevices' in profile or profile.get('ProvisionsAllDevices') or entitlements.get('get-task-allow') is not False:
    raise SystemExit('An App Store distribution profile is required; development/ad hoc profiles cannot be used.')
if entitlements.get('com.apple.developer.applesignin') != ['Default'] or entitlements.get('com.apple.developer.declared-age-range') is not True:
    raise SystemExit('The profile must include Sign in with Apple and Declared Age Range.')
expiration = profile.get('ExpirationDate')
if not expiration or expiration.replace(tzinfo=datetime.timezone.utc) <= datetime.datetime.now(datetime.timezone.utc):
    raise SystemExit('Provisioning profile expired.')
profile_uuid = str(uuid.UUID(profile['UUID']))
certificates = profile.get('DeveloperCertificates', [])
if len(certificates) != 1:
    raise SystemExit('Expected exactly one App Store distribution certificate.')
identity = hashlib.sha1(certificates[0]).hexdigest().upper()
(release / 'profile-uuid.txt').write_text(profile_uuid, encoding='utf-8')
(release / 'identity.txt').write_text(identity, encoding='utf-8')
with (release / 'ExportOptions.plist').open('wb') as file:
    plistlib.dump({
        'method': 'app-store-connect',
        'destination': 'upload',
        'signingStyle': 'manual',
        'signingCertificate': identity,
        'provisioningProfiles': {'app.vinctus.social': profile_uuid},
        'teamID': team,
        'manageAppVersionAndBuildNumber': False,
        'uploadSymbols': True,
    }, file)
PY

profile_uuid="$(cat "$release_dir/profile-uuid.txt")"
certificate_identity="$(cat "$release_dir/identity.txt")"
if ! security find-identity -v -p codesigning "$keychain_path" | grep -Fq "$certificate_identity"; then
  echo 'The imported certificate does not match the provisioning profile.' >&2
  exit 1
fi
for profile_directory in "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles" "$HOME/Library/MobileDevice/Provisioning Profiles"; do
  mkdir -p "$profile_directory"
  cp "$release_dir/distribution.mobileprovision" "$profile_directory/$profile_uuid.mobileprovision"
  installed_profiles+=("$profile_directory/$profile_uuid.mobileprovision")
done

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
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="$certificate_identity" \
  PROVISIONING_PROFILE_SPECIFIER="$profile_uuid" \
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
