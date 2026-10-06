import XCTest
@testable import VinctusNative

final class AppleSignInNonceTests: XCTestCase {
  func testRandomNonceHasTheLengthAndCharacters() {
    let allowed = Set(AppleSignInNonce.characters)

    let nonce = AppleSignInNonce.random()
    let short = AppleSignInNonce.random(length: 8)

    XCTAssertEqual(nonce.count, 32)
    XCTAssertEqual(short.count, 8)
    XCTAssertTrue(nonce.allSatisfy { allowed.contains($0) })
    XCTAssertNotEqual(nonce, AppleSignInNonce.random())
  }

  func testSHA256IsLowercaseHex() {
    XCTAssertEqual(
      AppleSignInNonce.sha256("abc"),
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    )
  }
}
