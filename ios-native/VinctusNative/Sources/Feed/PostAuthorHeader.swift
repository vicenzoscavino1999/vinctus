import SwiftUI

/// Who published a post, where and when, like the web's PostAuthorRow: the photo and the name
/// open the profile, "en <grupo>" opens the group.
struct PostAuthorHeader<Trailing: View>: View {
  let authorID: String?
  let authorName: String
  let groupID: String?
  let createdAt: Date?
  var onOpenProfile: (() -> Void)?
  var onOpenGroup: (() -> Void)?
  @ViewBuilder var trailing: () -> Trailing

  @ObservedObject private var groupNames = GroupNames.shared

  var body: some View {
    HStack(spacing: 10) {
      Button {
        onOpenProfile?()
      } label: {
        AvatarView(name: authorName, photoURLString: nil, size: 36)
      }
      .buttonStyle(.borderless)
      .disabled(onOpenProfile == nil)
      .accessibilityLabel("Perfil de \(authorName)")

      VStack(alignment: .leading, spacing: 1) {
        HStack(spacing: 4) {
          Button {
            onOpenProfile?()
          } label: {
            Text(authorName)
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(VinctusTokens.Color.textPrimary)
              .lineLimit(1)
          }
          .buttonStyle(.borderless)
          .disabled(onOpenProfile == nil)

          if let groupName = groupNames.name(for: groupID) {
            Text("en")
              .font(.subheadline)
              .foregroundStyle(VinctusTokens.Color.textMuted)
            Button {
              onOpenGroup?()
            } label: {
              Text(groupName)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(VinctusTokens.Color.textSecondary)
                .lineLimit(1)
            }
            .buttonStyle(.borderless)
            .disabled(onOpenGroup == nil)
          }
        }
        if let createdAt {
          Text(ConnectionsFormat.relativeAge(createdAt))
            .font(.caption)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
      }
      Spacer(minLength: 0)
      trailing()
    }
    .task(id: groupID) {
      if let groupID { await groupNames.load(groupID) }
    }
  }
}

/// The web address of a post, to share it.
enum PostLinks {
  static let webBase = "https://vinctus.vercel.app"

  static func webURL(postID: String) -> URL {
    URL(string: "\(webBase)/post/\(postID)") ?? URL(string: webBase)!
  }
}
