# Architecture of the native app

SwiftUI app that reads and writes the same Firebase data as the web app (`src/`).

## Folders (`Sources/`)

| Folder        | Contents                                                                 |
| ------------- | ------------------------------------------------------------------------ |
| `App/`        | Entry point, root and tab views, `AppRepos` (data sources), demo data    |
| `Shared/`     | Design system, avatar, `FirestoreValue` helpers, connectivity, legal     |
| `Auth/`       | Sign-in screen, auth repo and view model, age checks, profile bootstrap  |
| `Discover/`   | Discover tab and people search                                           |
| `Feed/`       | Community feed, post detail, comments, creating posts, likes and follows |
| `Chat/`       | Messages tab: direct and group conversations                             |
| `Groups/`     | Group list and detail, join and leave                                    |
| `Profile/`    | Profile screen, its sections, followers lists, profile editing           |
| `Moderation/` | Reports, blocking, blocked users                                         |
| `AI/`         | Chat con IA, Arena IA, AI consent                                        |
| `Settings/`   | Settings, account deletion                                               |

XcodeGen (`project.yml`) turns each folder into an Xcode group, so a new file only has to be
placed in the right folder.

## Layers

Each feature follows the same path:

```
View  →  ViewModel (screen state, @MainActor)  →  Repo protocol  →  Firebase implementation
```

- **Views never call Firebase.** They get data through a repo protocol.
- **Repos are created in one place: `App/AppRepos.swift`.** Views and view models take a repo in
  their initializer, with an `AppRepos.x()` default. Don't write `FirebaseXRepo()` anywhere else.
- **Demo mode:** screenshot builds (`SCREENSHOTS` flag, `-VinctusDemo` launch argument) get the
  sample repos in `App/DemoData.swift` from `AppRepos`, so screens can be checked without Firebase.
- **Same data as the web:** each repo mirrors a file in `src/shared/lib/firestore/` and says which
  one in a comment. Keep field names, document ids and limits identical, and check
  `firestore.rules` when writing a new field.
- **Firestore values:** read loose fields with `FirestoreValue.string/int/double/date`, and use
  the `async` Firebase APIs (`try await ref.getDocument()`) instead of callback wrappers.

## Tests

`Tests/` runs without Firebase: view models get the fakes in `Tests/TestFakes.swift`, and data
rules (conversation ids, report fields, contribution checks) are plain functions tested directly.
When a screen gets new logic, put it in its view model or a `static func` so it can be tested.

## Checks

`.github/workflows/ios-native.yml` builds the app and runs the unit tests (`Tests/`) on every push.
`.github/workflows/ios-screenshots.yml` takes screenshots of the demo mode and pushes them to the
`ios-screenshots` branch.
