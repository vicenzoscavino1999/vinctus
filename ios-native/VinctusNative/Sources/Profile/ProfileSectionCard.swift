import SwiftUI

/// Card with a small uppercase title, like the sections of the web profile.
struct ProfileSectionCard<Content: View, Accessory: View>: View {
  let title: String
  let icon: String
  let accessory: Accessory
  let content: Content

  init(
    title: String,
    icon: String,
    @ViewBuilder accessory: () -> Accessory,
    @ViewBuilder content: () -> Content
  ) {
    self.title = title
    self.icon = icon
    self.accessory = accessory()
    self.content = content()
  }

  var body: some View {
    VStack(alignment: .leading, spacing: VinctusTokens.Spacing.sm) {
      HStack {
        Label(title.uppercased(), systemImage: icon)
          .font(.caption.weight(.semibold))
          .tracking(1.2)
          .foregroundStyle(VinctusTokens.Color.textMuted)
        Spacer()
        accessory
      }
      content
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(VinctusTokens.Spacing.md)
    .background(VinctusTokens.Color.surface)
    .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.lg, style: .continuous))
  }
}

extension ProfileSectionCard where Accessory == EmptyView {
  init(title: String, icon: String, @ViewBuilder content: () -> Content) {
    self.init(title: title, icon: icon, accessory: { EmptyView() }, content: content)
  }
}

/// "Cargar más" button at the end of a paged list.
struct LoadMoreButton: View {
  let isLoading: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 6) {
        if isLoading {
          ProgressView()
            .controlSize(.small)
        }
        Text("Cargar más")
          .font(.subheadline.weight(.semibold))
      }
      .frame(maxWidth: .infinity)
      .padding(.vertical, 6)
      .foregroundStyle(VinctusTokens.Color.accent)
    }
    .buttonStyle(.plain)
    .disabled(isLoading)
  }
}

struct ProfileSectionMessage: View {
  let text: String
  var isError = false

  var body: some View {
    Text(text)
      .font(.footnote)
      .foregroundStyle(isError ? SwiftUI.Color.red : VinctusTokens.Color.textMuted)
  }
}

// MARK: - About

struct ProfileAboutSection: View {
  let profile: UserProfile
  let isOwnProfile: Bool
  let onEdit: () -> Void

  var body: some View {
    ProfileSectionCard(title: "Sobre mí", icon: "person.text.rectangle") {
      if let bio = profile.bio, !bio.isEmpty {
        Text(bio)
          .font(.body)
          .foregroundStyle(VinctusTokens.Color.textPrimary)
      } else if isOwnProfile {
        ProfileSectionMessage(text: "Aún no has añadido una biografía. ¡Cuéntale al mundo sobre ti!")
        Button("+ Añadir biografía", action: onEdit)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(VinctusTokens.Color.accent)
      } else {
        ProfileSectionMessage(text: "Sin biografía aún.")
      }
    }
  }
}

// MARK: - Reputation

struct ProfileReputationSection: View {
  let reputation: Int
  let karma: [String: Double]

  private var topInterests: [(id: String, value: Double)] { Self.topInterests(karma) }

  /// The six interests with the most points, like the web profile.
  static func topInterests(_ karma: [String: Double]) -> [(id: String, value: Double)] {
    karma.filter { $0.value > 0 }
      .sorted { $0.value == $1.value ? $0.key < $1.key : $0.value > $1.value }
      .prefix(6)
      .map { (id: $0.key, value: $0.value) }
  }

  var body: some View {
    ProfileSectionCard(title: "Reputación", icon: "star") {
      HStack(spacing: VinctusTokens.Spacing.md) {
        GeometryReader { proxy in
          ZStack(alignment: .leading) {
            Capsule().fill(VinctusTokens.Color.surface2)
            Capsule()
              .fill(LinearGradient(
                colors: [VinctusTokens.Color.accent.opacity(0.7), VinctusTokens.Color.accent],
                startPoint: .leading,
                endPoint: .trailing
              ))
              .frame(width: proxy.size.width * CGFloat(min(max(reputation, 0), 100)) / 100)
          }
        }
        .frame(height: 6)
        Text("\(reputation)")
          .font(.title3)
          .foregroundStyle(VinctusTokens.Color.textPrimary)
      }
      ProfileSectionMessage(text: "Contribuye para aumentar tu reputación.")
      if !topInterests.isEmpty {
        ProfileChips(items: topInterests.map {
          "\(InterestCategory.title(for: $0.id)) · \(Int($0.value.rounded()))"
        })
      }
    }
  }
}

/// Wrapping row of small pills.
private struct ProfileChips: View {
  let items: [String]

  var body: some View {
    FlowLayout(spacing: 6) {
      ForEach(items, id: \.self) { item in
      Text(item)
        .font(.caption)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(VinctusTokens.Color.surface2)
        .foregroundStyle(VinctusTokens.Color.textPrimary)
        .clipShape(Capsule())
      }
    }
  }
}

/// Places views left to right and wraps to a new line when the row is full.
private struct FlowLayout: Layout {
  var spacing: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let width = proposal.width ?? .infinity
    let rows = arrange(subviews, width: width)
    let height = rows.map(\.height).reduce(0, +) + spacing * CGFloat(max(rows.count - 1, 0))
    let usedWidth = rows.map(\.width).max() ?? 0
    return CGSize(width: proposal.width ?? usedWidth, height: height)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    var y = bounds.minY
    for row in arrange(subviews, width: bounds.width) {
      var x = bounds.minX
      for index in row.indices {
        let size = subviews[index].sizeThatFits(.unspecified)
        subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
        x += size.width + spacing
      }
      y += row.height + spacing
    }
  }

  private struct Row {
    var indices: [Int] = []
    var width: CGFloat = 0
    var height: CGFloat = 0
  }

  private func arrange(_ subviews: Subviews, width: CGFloat) -> [Row] {
    var rows: [Row] = []
    var current = Row()
    for index in subviews.indices {
      let size = subviews[index].sizeThatFits(.unspecified)
      let extra = current.indices.isEmpty ? size.width : size.width + spacing
      if !current.indices.isEmpty && current.width + extra > width {
        rows.append(current)
        current = Row()
      }
      current.width += current.indices.isEmpty ? size.width : size.width + spacing
      current.height = max(current.height, size.height)
      current.indices.append(index)
    }
    if !current.indices.isEmpty { rows.append(current) }
    return rows
  }
}
