import Foundation

/// The one place that creates the app's data sources. Screens and view models receive a repo
/// through their initializer (defaulting to these factories) instead of creating a Firebase repo
/// themselves, so every data source can be swapped in one spot.
///
/// Builds made by the screenshot workflow (.github/workflows/ios-screenshots.yml) compile with
/// `SCREENSHOTS` and, when launched with `-VinctusDemo`, skip sign-in and use the sample data in
/// DemoData.swift, so screens can be reviewed without a Firebase account.
enum AppRepos {
  static var isDemo: Bool {
    #if SCREENSHOTS
    return ProcessInfo.processInfo.arguments.contains("-VinctusDemo")
    #else
    return false
    #endif
  }

  /// The signed-in user in demo mode (the sample chats use it for "my" messages).
  static let demoUserID = "me"

  /// Launch argument value after `name`, e.g. `-VinctusTab messages`. Screenshot builds only.
  static func demoArgument(_ name: String) -> String? {
    guard isDemo else { return nil }
    let args = ProcessInfo.processInfo.arguments
    guard let index = args.firstIndex(of: name), index + 1 < args.count else { return nil }
    return args[index + 1]
  }

  // MARK: Repos with sample data in demo mode

  static func discover() -> DiscoverRepo {
    #if SCREENSHOTS
    if isDemo { return SampleDiscoverRepo() }
    #endif
    return FirebaseDiscoverRepo()
  }

  static func groups() -> any GroupsRepo {
    #if SCREENSHOTS
    if isDemo { return SampleGroupsRepo() }
    #endif
    return FirebaseGroupsRepo()
  }

  static func profile() -> ProfileRepo {
    #if SCREENSHOTS
    if isDemo { return SampleProfileRepo() }
    #endif
    return FirebaseProfileRepo()
  }

  static func feed() -> FeedRepo {
    #if SCREENSHOTS
    if isDemo { return SampleFeedRepo() }
    #endif
    return FirebaseFeedRepo()
  }

  static func profileContent() -> ProfileContentRepo {
    #if SCREENSHOTS
    if isDemo { return SampleProfileContentRepo() }
    #endif
    return FirebaseProfileContentRepo()
  }

  static func chat() -> ChatRepo {
    #if SCREENSHOTS
    if isDemo { return SampleChatRepo() }
    #endif
    return FirebaseChatRepo()
  }

  // MARK: Repos without sample data

  static func auth() -> AuthRepo { FirebaseAuthRepo() }
  static func profileBootstrap() -> UserProfileBootstrapRepo { FirebaseUserProfileBootstrapRepo() }
  static func createPost() -> any CreatePostRepo { FirebaseCreatePostRepo() }
  static func postComments() -> any PostCommentsRepo { FirebasePostCommentsRepo() }
  static func engagement() -> EngagementRepo { FirebaseEngagementRepo() }
  static func moderation() -> ModerationRepo { FirebaseModerationRepo() }
  static func ai() -> AIRepo { FirebaseAIRepo() }
  static func aiConsent() -> AIConsentRepo { FirebaseAIConsentRepo() }
  static func deleteAccount() -> DeleteAccountRepo { FirebaseDeleteAccountRepo() }
}
