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

- `ios-native/VinctusNative/Resources/GoogleService-Info-Dev.plist`
- `ios-native/VinctusNative/Resources/GoogleService-Info-Staging.plist`
- `ios-native/VinctusNative/Resources/GoogleService-Info-Prod.plist`

The active environment is controlled by the Xcode scheme:

- `VinctusNative-Dev`
- `VinctusNative-Staging`
- `VinctusNative-Prod`
