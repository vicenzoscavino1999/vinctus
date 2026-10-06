import SwiftUI

/// Round profile photo, or the name's initial when there is none.
struct AvatarView: View {
  let name: String
  let photoURLString: String?
  let size: CGFloat

  var body: some View {
    ZStack {
      Circle()
        .fill(VinctusTokens.Color.surface2)

      if let url = avatarURL {
        AsyncImage(url: url) { phase in
          switch phase {
          case .empty:
            ProgressView()
          case .success(let image):
            image
              .resizable()
              .scaledToFill()
          case .failure:
            initialText
          @unknown default:
            initialText
          }
        }
      } else {
        initialText
      }
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
    .overlay(
      Circle()
        .stroke(VinctusTokens.Color.border.opacity(0.35), lineWidth: 1)
    )
  }

  private var avatarURL: URL? {
    guard let photoURLString else { return nil }
    return URL(string: photoURLString)
  }

  private var initialText: some View {
    Text(String(name.prefix(1)).uppercased())
      .font(.system(size: size * 0.38, weight: .semibold))
      .foregroundStyle(.secondary)
  }
}
