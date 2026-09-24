# VinctusNative (iOS)

SwiftUI base app for the native iOS migration (Semana 4+).

## Generate project

This folder uses XcodeGen to generate the Xcode project:

```bash
cd ios-native/VinctusNative
xcodegen generate
```

## Firebase setup (dev/staging/prod)

Add the corresponding Firebase iOS config plists (not committed):

- `ios-native/VinctusNative/Resources/Firebase/GoogleService-Info-Dev.plist`
- `ios-native/VinctusNative/Resources/Firebase/GoogleService-Info-Staging.plist`
- `ios-native/VinctusNative/Resources/Firebase/GoogleService-Info-Prod.plist`

The active environment is controlled by the Xcode scheme:

- `VinctusNative-Dev`
- `VinctusNative-Staging`
- `VinctusNative-Prod`

## Google Sign-In setup (Semana 6)

1. Regenerate the Xcode project after `project.yml` changes:

```bash
cd ios-native/VinctusNative
xcodegen generate
```

2. For each environment (`Dev`, `Staging`, `Prod`), create the uncommitted `Config/<Env>.local.xcconfig` with the `REVERSED_CLIENT_ID` from that environment's `GoogleService-Info-*.plist`. `Config/<Env>.xcconfig` includes it, so the value survives `xcodegen generate`. Do not set `GOOGLE_REVERSED_CLIENT_ID` in the target Build Settings: that overrides the xcconfig.

```bash
cd ios-native/VinctusNative
echo "GOOGLE_REVERSED_CLIENT_ID = $(/usr/libexec/PlistBuddy -c 'Print :REVERSED_CLIENT_ID' Resources/Firebase/GoogleService-Info-Dev.plist)" > Config/Dev.local.xcconfig
```

3. Build and run using `VinctusNative-Dev` and validate `Continue with Google`.

## Run Dev build from CLI

From repository root:

```bash
./scripts/run-ios-dev.sh
```

Useful overrides:

```bash
SIMULATOR_NAME="iPhone 17 Pro" ./scripts/run-ios-dev.sh
SIMULATOR_ID="<SIMULATOR_UDID>" ./scripts/run-ios-dev.sh
SCHEME="VinctusNative-Dev" CONFIG="DebugDev" ./scripts/run-ios-dev.sh
```
