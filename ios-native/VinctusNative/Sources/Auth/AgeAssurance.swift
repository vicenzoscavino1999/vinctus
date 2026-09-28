import SwiftUI
import UIKit
#if canImport(DeclaredAgeRange)
import DeclaredAgeRange
#endif

enum AgeCheckOutcome: Equatable {
  case allowed
  case underMinimumAge
  case needsAgeSharing
}

/// Age checks required by US state laws (Utah, Louisiana, Texas) and similar rules elsewhere.
/// Apple's Declared Age Range API says whether they apply to this user; only then the app asks
/// for the age range, and people under the minimum age can't use Vinctus. Everyone else (older
/// iOS versions, regions without those laws) is let through without a prompt.
enum AgeAssurance {
  static let minimumAge = 13
  /// `isEligibleForAgeFeatures` has been reported to hang, so don't block launch on it.
  private static let eligibilityTimeout: Duration = .seconds(5)

  @MainActor
  static func check() async -> AgeCheckOutcome {
    #if canImport(DeclaredAgeRange)
    if #available(iOS 26.2, *) {
      return await checkDeclaredAgeRange()
    }
    #endif
    return .allowed
  }

  #if canImport(DeclaredAgeRange)
  @available(iOS 26.2, *)
  @MainActor
  private static func checkDeclaredAgeRange() async -> AgeCheckOutcome {
    guard await isEligibleForAgeFeatures() else { return .allowed }
    guard let presenter = topViewController() else { return .needsAgeSharing }

    do {
      let response = try await AgeRangeService.shared.requestAgeRange(
        ageGates: minimumAge, 16, 18, in: presenter
      )
      switch response {
      case .sharing(let range):
        if let upperBound = range.upperBound, upperBound < minimumAge {
          return .underMinimumAge
        }
        return .allowed
      case .declinedSharing:
        return .needsAgeSharing
      @unknown default:
        return .needsAgeSharing
      }
    } catch {
      AppLog.auth.error("ageRange.request.failed errorType=\(AppLog.errorType(error), privacy: .public)")
      return .needsAgeSharing
    }
  }

  @available(iOS 26.2, *)
  private static func isEligibleForAgeFeatures() async -> Bool {
    let firstAnswer = FirstAnswer()
    return await withCheckedContinuation { continuation in
      Task {
        let eligible = (try? await AgeRangeService.shared.isEligibleForAgeFeatures) ?? false
        if await firstAnswer.claim() { continuation.resume(returning: eligible) }
      }
      Task {
        try? await Task.sleep(for: eligibilityTimeout)
        if await firstAnswer.claim() { continuation.resume(returning: false) }
      }
    }
  }
  #endif

  @MainActor
  private static func topViewController() -> UIViewController? {
    let root = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first(where: \.isKeyWindow)?
      .rootViewController
    var current = root
    while let presented = current?.presentedViewController {
      current = presented
    }
    return current
  }
}

/// Lets only the first of two racing tasks resume a continuation.
private actor FirstAnswer {
  private var claimed = false

  func claim() -> Bool {
    guard !claimed else { return false }
    claimed = true
    return true
  }
}

/// Shows `content` once the age check passes.
struct AgeGate<Content: View>: View {
  @ViewBuilder let content: () -> Content

  @EnvironmentObject private var authVM: AuthViewModel
  @State private var outcome: AgeCheckOutcome?
  @State private var attempt = 0

  var body: some View {
    Group {
      switch outcome {
      case .allowed:
        content()
      case .underMinimumAge:
        blocked(
          title: "Vinctus es para mayores de \(AgeAssurance.minimumAge) años",
          message: "Según la información de edad de tu cuenta de Apple, no puedes usar Vinctus.",
          canRetry: false
        )
      case .needsAgeSharing:
        blocked(
          title: "Necesitamos confirmar tu edad",
          message: "Por las leyes de tu región, para usar Vinctus debes compartir tu rango de edad con Apple. Solo recibimos el rango (por ejemplo, 18 o más), no tu fecha de nacimiento.",
          canRetry: true
        )
      case nil:
        ProgressView()
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
    .task(id: attempt) {
      outcome = await AgeAssurance.check()
    }
  }

  private func blocked(title: String, message: String, canRetry: Bool) -> some View {
    VStack(alignment: .leading, spacing: VinctusTokens.Spacing.lg) {
      Text(title)
        .font(.title2.bold())
      Text(message)
        .foregroundStyle(VinctusTokens.Color.textMuted)
      if canRetry {
        VButton("Compartir mi rango de edad") {
          outcome = nil
          attempt += 1
        }
      }
      VButton("Cerrar sesión", variant: .secondary) {
        authVM.signOut()
      }
      Spacer()
    }
    .padding(VinctusTokens.Spacing.xl)
  }
}
