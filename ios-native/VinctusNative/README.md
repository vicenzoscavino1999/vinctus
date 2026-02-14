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

2. In Xcode, set `GOOGLE_REVERSED_CLIENT_ID` in target Build Settings for each config (`DebugDev`, `DebugStaging`, `DebugProd`, `ReleaseProd`).
3. The value is the local `REVERSED_CLIENT_ID` from each environment's `GoogleService-Info-*.plist`.
4. Build and run using `VinctusNative-Dev` and validate `Continue with Google`.

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

## Run iOS CI gates locally

From repository root:

```bash
brew install swiftlint
./scripts/run-ios-swiftlint.sh
./scripts/run-ios-ci.sh
```

Optional overrides:

```bash
SIMULATOR_NAME="iPhone 17 Pro" ./scripts/run-ios-ci.sh
SIMULATOR_ID="<SIMULATOR_UDID>" ./scripts/run-ios-ci.sh
SCHEME="VinctusNative-Dev" CONFIG="DebugDev" ./scripts/run-ios-ci.sh
```
