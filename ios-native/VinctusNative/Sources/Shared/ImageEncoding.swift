import UIKit

enum ImageEncoding {
  /// Scales the image so its longest side is at most `maxSide` pixels and encodes it as JPEG.
  /// storage.rules accepts images up to 10 MB; this keeps uploads far below that.
  static func jpegData(_ image: UIImage, maxSide: CGFloat, quality: CGFloat = 0.85) -> Data? {
    let scale = min(1, maxSide / max(image.size.width, image.size.height))
    let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in
      image.draw(in: CGRect(origin: .zero, size: size))
    }
    return resized.jpegData(compressionQuality: quality)
  }
}
