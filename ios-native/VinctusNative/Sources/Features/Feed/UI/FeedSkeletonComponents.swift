import SwiftUI

struct FeedGroupSkeletonRows: View {
  var body: some View {
    ForEach(0..<3, id: \.self) { _ in
      VCard {
        HStack(spacing: VinctusTokens.Spacing.md) {
          RoundedRectangle(cornerRadius: 14, style: .continuous)
            .fill(SwiftUI.Color.gray.opacity(0.2))
            .frame(width: 52, height: 52)
          VStack(alignment: .leading, spacing: 6) {
            RoundedRectangle(cornerRadius: 4, style: .continuous)
              .fill(SwiftUI.Color.gray.opacity(0.24))
              .frame(width: 170, height: 14)
            RoundedRectangle(cornerRadius: 4, style: .continuous)
              .fill(SwiftUI.Color.gray.opacity(0.18))
              .frame(width: 220, height: 12)
          }
          Spacer()
        }
      }
      .redacted(reason: .placeholder)
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)
    }
  }
}

struct FeedDirectSkeletonRows: View {
  var body: some View {
    ForEach(0..<3, id: \.self) { _ in
      VCard {
        HStack(spacing: 12) {
          Circle()
            .fill(SwiftUI.Color.gray.opacity(0.2))
            .frame(width: 44, height: 44)

          VStack(alignment: .leading, spacing: 6) {
            RoundedRectangle(cornerRadius: 4, style: .continuous)
              .fill(SwiftUI.Color.gray.opacity(0.24))
              .frame(width: 160, height: 14)
            RoundedRectangle(cornerRadius: 4, style: .continuous)
              .fill(SwiftUI.Color.gray.opacity(0.18))
              .frame(width: 220, height: 12)
          }
          Spacer()
        }
      }
      .redacted(reason: .placeholder)
      .listRowSeparator(.hidden)
      .listRowBackground(SwiftUI.Color.clear)
    }
  }
}
