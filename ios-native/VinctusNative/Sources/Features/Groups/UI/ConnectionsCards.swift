import SwiftUI

struct ConnectionsPublishButton: View {
  let title: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.callout.weight(.semibold))
        .tracking(0.8)
        .foregroundStyle(.black.opacity(0.82))
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
        .background(VinctusTokens.Color.accent)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
    .buttonStyle(.plain)
  }
}

struct ConnectionsCollaborationCard: View {
  let group: GroupSummary
  let recencyLabel: String
  let locationLabel: String

  var body: some View {
    VCard {
      VStack(alignment: .leading, spacing: 9) {
        HStack(alignment: .center) {
          Text((group.categoryID?.replacingOccurrences(of: "_", with: " ") ?? "Proyecto").uppercased())
            .font(.caption2.weight(.medium))
            .tracking(0.8)
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .lineLimit(1)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(VinctusTokens.Color.surface2)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))

          Spacer()

          Text(recencyLabel)
            .font(.callout)
            .foregroundStyle(VinctusTokens.Color.textMuted.opacity(0.9))
        }

        Text(group.name)
          .font(VinctusTokens.Typography.sectionTitle(size: 21))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .lineLimit(1)

        Text("Por comunidad vinctus")
          .font(.footnote)
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .lineLimit(1)

        HStack(alignment: .center) {
          Text(locationLabel)
            .font(.caption2.weight(.medium))
            .foregroundStyle(VinctusTokens.Color.textMuted)
            .lineLimit(1)
            .padding(.horizontal, 8)
            .padding(.vertical, 4.5)
            .background(VinctusTokens.Color.surface2)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))

          Spacer()

          HStack(spacing: 8) {
            Text("SOLICITAR")
              .font(.callout.weight(.semibold))
              .tracking(0.6)
              .foregroundStyle(VinctusTokens.Color.textPrimary.opacity(0.92))
            Image(systemName: "arrow.right")
              .font(.callout.weight(.semibold))
              .foregroundStyle(VinctusTokens.Color.textMuted)
          }
          .padding(.horizontal, 11)
          .padding(.vertical, 5)
          .overlay(
            Capsule()
              .stroke(VinctusTokens.Color.border.opacity(0.62), lineWidth: 1)
          )
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

struct ConnectionsEncounterCard: View {
  let group: GroupSummary
  let locationLabel: String

  var body: some View {
    VCard {
      VStack(alignment: .leading, spacing: 8) {
        HStack(alignment: .top) {
          VStack(alignment: .leading, spacing: 2) {
            Text(dayText)
              .font(VinctusTokens.Typography.sectionTitle(size: 24))
              .foregroundStyle(VinctusTokens.Color.textPrimary)
            Text(monthText)
              .font(.caption2.weight(.semibold))
              .tracking(1.1)
              .foregroundStyle(VinctusTokens.Color.textMuted)
          }

          Spacer()

          Circle()
            .stroke(VinctusTokens.Color.border.opacity(0.75), lineWidth: 1)
            .frame(width: 30, height: 30)
            .overlay(
              Image(systemName: "arrow.right")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(VinctusTokens.Color.textMuted)
            )
        }

        Spacer(minLength: 2)

        Text(group.name)
          .font(VinctusTokens.Typography.sectionTitle(size: 19))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .lineLimit(1)

        Label(locationLabel, systemImage: "location")
          .font(.caption2)
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .lineLimit(1)
      }
      .frame(width: 148, height: 146, alignment: .topLeading)
    }
  }

  private var dayText: String {
    ConnectionsDateFormatters.day.string(from: group.updatedAt)
  }

  private var monthText: String {
    ConnectionsDateFormatters.month.string(from: group.updatedAt).uppercased()
  }
}

private enum ConnectionsDateFormatters {
  static let day: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "es_ES")
    formatter.dateFormat = "d"
    return formatter
  }()

  static let month: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "es_ES")
    formatter.dateFormat = "MMM"
    return formatter
  }()
}
