import CoreGraphics
import UIKit

enum CreatePostMediaProcessor {
  static func compressedImagePayload(
    from image: UIImage,
    maxBytes: Int,
    maxDimension: CGFloat = 1920
  ) -> (preview: UIImage, data: Data, width: Int, height: Int)? {
    let resized = resizedImageIfNeeded(image, maxDimension: maxDimension)
    let qualities: [CGFloat] = [0.84, 0.74, 0.64, 0.54, 0.44]
    for quality in qualities {
      guard let data = resized.jpegData(compressionQuality: quality) else { continue }
      if data.count < maxBytes {
        return (
          preview: resized,
          data: data,
          width: Int(resized.size.width.rounded()),
          height: Int(resized.size.height.rounded())
        )
      }
    }
    return nil
  }

  static func sanitizedFileName(_ raw: String) -> String {
    let fallback = "photo.jpg"
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return fallback }

    let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "._-"))
    let mapped = trimmed.unicodeScalars.map { scalar -> Character in
      allowed.contains(scalar) ? Character(scalar) : "_"
    }
    let sanitized = String(mapped).trimmingCharacters(in: CharacterSet(charactersIn: "._"))
    if sanitized.isEmpty {
      return fallback
    }
    return String(sanitized.prefix(120))
  }

  private static func resizedImageIfNeeded(_ image: UIImage, maxDimension: CGFloat) -> UIImage {
    let currentSize = image.size
    let longestSide = max(currentSize.width, currentSize.height)
    guard longestSide > maxDimension else { return image }

    let ratio = maxDimension / longestSide
    let targetSize = CGSize(width: currentSize.width * ratio, height: currentSize.height * ratio)

    let format = UIGraphicsImageRendererFormat.default()
    format.scale = 1
    return UIGraphicsImageRenderer(size: targetSize, format: format).image { _ in
      image.draw(in: CGRect(origin: .zero, size: targetSize))
    }
  }
}
