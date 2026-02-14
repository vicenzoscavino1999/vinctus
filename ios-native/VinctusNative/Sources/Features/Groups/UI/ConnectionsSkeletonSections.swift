import SwiftUI

struct ConnectionsCollaborationsSkeletonSection: View {
  var body: some View {
    Group {
      Text("Colaboraciones")
        .font(VinctusTokens.Typography.sectionTitle(size: 26))
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .vinctusGroupsListRowStyle()

      ForEach(0..<2, id: \.self) { _ in
        VCard {
          VStack(alignment: .leading, spacing: 12) {
            HStack {
              RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(SwiftUI.Color.gray.opacity(0.22))
                .frame(width: 116, height: 24)
              Spacer()
              RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(SwiftUI.Color.gray.opacity(0.16))
                .frame(width: 80, height: 16)
            }

            RoundedRectangle(cornerRadius: 6, style: .continuous)
              .fill(SwiftUI.Color.gray.opacity(0.24))
              .frame(width: 180, height: 24)

            RoundedRectangle(cornerRadius: 6, style: .continuous)
              .fill(SwiftUI.Color.gray.opacity(0.18))
              .frame(width: 220, height: 16)

            HStack {
              RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(SwiftUI.Color.gray.opacity(0.16))
                .frame(width: 56, height: 22)
              Spacer()
              RoundedRectangle(cornerRadius: 999, style: .continuous)
                .fill(SwiftUI.Color.gray.opacity(0.18))
                .frame(width: 120, height: 30)
            }
          }
        }
        .redacted(reason: .placeholder)
        .vinctusGroupsListRowStyle()
      }
    }
  }
}

struct ConnectionsEncountersSkeletonSection: View {
  var body: some View {
    Group {
      Text("Encuentros")
        .font(VinctusTokens.Typography.sectionTitle(size: 26))
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .vinctusGroupsListRowStyle()

      ConnectionsPublishButton(title: "+ PUBLICAR ENCUENTRO") {}
        .redacted(reason: .placeholder)
        .vinctusGroupsListRowStyle()

      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: VinctusTokens.Spacing.md) {
          ForEach(0..<3, id: \.self) { _ in
            RoundedRectangle(cornerRadius: VinctusTokens.Radius.md, style: .continuous)
              .fill(VinctusTokens.Color.surface)
              .frame(width: 164, height: 170)
              .overlay(
                RoundedRectangle(cornerRadius: VinctusTokens.Radius.md, style: .continuous)
                  .stroke(VinctusTokens.Color.border.opacity(0.55), lineWidth: 1)
              )
              .redacted(reason: .placeholder)
          }
        }
        .padding(.horizontal, 1)
        .padding(.vertical, 2)
      }
      .vinctusGroupsListRowStyle()
    }
  }
}

private extension View {
  func vinctusGroupsListRowStyle() -> some View {
    self
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)
  }
}
