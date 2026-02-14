import SwiftUI

struct VAvatarView: View {
  let name: String
  let photoURLString: String?
  let size: CGFloat
  var ringColor: SwiftUI.Color?
  var ringWidth: CGFloat = 1
  var backgroundColor: SwiftUI.Color = VinctusTokens.Color.surface2
  var textColor: SwiftUI.Color = VinctusTokens.Color.textMuted
  var textFont: Font?

  var body: some View {
    ZStack {
      Circle()
        .fill(backgroundColor)

      if let url = avatarURL {
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
    .clipShape(Circle())
    .overlay {
      if let ringColor {
        Circle()
          .stroke(ringColor, lineWidth: ringWidth)
      }
    }
  }

  private var avatarURL: URL? {
    guard let photoURLString else { return nil }
    return URL(string: photoURLString)
  }

  private var fallbackInitial: some View {
    Text(String(name.prefix(1)).uppercased())
      .font(textFont ?? .headline.weight(.semibold))
      .foregroundStyle(textColor)
  }
}
