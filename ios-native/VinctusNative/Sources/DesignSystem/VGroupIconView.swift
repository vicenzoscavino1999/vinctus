import SwiftUI

struct VGroupIconView: View {
  let name: String
  let iconURLString: String?
  let size: CGFloat
  var cornerRadius: CGFloat = 12
  var backgroundColor: SwiftUI.Color = VinctusTokens.Color.surface2
  var textColor: SwiftUI.Color = VinctusTokens.Color.textMuted
  var textFont: Font = .headline

  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        .fill(backgroundColor)

      if let url = parsedURL {
        AsyncImage(url: url) { phase in
          switch phase {
          case .empty:
            ProgressView()
              .controlSize(.small)
          case .success(let image):
            image
              .resizable()
              .scaledToFill()
          case .failure:
            fallbackInitial
          @unknown default:
            fallbackInitial
          }
        }
      } else {
        fallbackInitial
      }
    }
    .frame(width: size, height: size)
    .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
  }

  private var parsedURL: URL? {
    guard let iconURLString else { return nil }
    return URL(string: iconURLString)
  }

  private var fallbackInitial: some View {
    Text(String(name.prefix(1)).uppercased())
      .font(textFont)
      .foregroundStyle(textColor)
  }
}
