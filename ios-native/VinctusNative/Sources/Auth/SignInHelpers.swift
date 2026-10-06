import CryptoKit
import Foundation
import Security
import UIKit

/// The nonce Sign in with Apple needs: the request carries its SHA-256, and the raw value goes to
/// Firebase, which checks that the Apple token was issued for this request.
enum AppleSignInNonce {
  /// Characters of Firebase's sample nonce generator.
  static let characters = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")

  static func random(length: Int = 32) -> String {
    precondition(length > 0)

    var result = ""
    var remainingLength = length

    while remainingLength > 0 {
      var randoms = [UInt8](repeating: 0, count: 16)
      let errorCode = SecRandomCopyBytes(kSecRandomDefault, randoms.count, &randoms)
      if errorCode != errSecSuccess {
        let fallback = UUID().uuidString.replacingOccurrences(of: "-", with: "")
        return String(fallback.prefix(length))
      }

      randoms.forEach { random in
        if remainingLength == 0 { return }
        if Int(random) < characters.count {
          result.append(characters[Int(random)])
          remainingLength -= 1
        }
      }
    }

    return result
  }

  static func sha256(_ input: String) -> String {
    let digest = SHA256.hash(data: Data(input.utf8))
    return digest.map { String(format: "%02x", $0) }.joined()
  }
}

/// Where Google Sign-In shows its screen: the top view controller of the active window.
enum SignInPresenter {
  @MainActor
  static func topViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .filter { $0.activationState == .foregroundActive }

    for scene in scenes {
      guard let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController else {
        continue
      }
      var current = root
      while let presented = current.presentedViewController {
        current = presented
      }
      return current
    }

    return nil
  }
}
