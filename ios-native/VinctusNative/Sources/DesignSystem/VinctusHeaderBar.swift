import SwiftUI

struct VinctusHeaderBar: View {
  let onTapCreatePost: () -> Void
  var showsDivider: Bool = true
  var onTapSparkles: (() -> Void)?
  var onTapBell: (() -> Void)?

  @State private var hint: HeaderHint?

  var body: some View {
    VStack(spacing: 0) {
      ZStack {
        HStack {
          Circle()
            .fill(VinctusTokens.Color.accent)
            .frame(width: 42, height: 42)
            .overlay(
              Image(systemName: "plus")
                .font(.headline.weight(.semibold))
                .foregroundStyle(.black)
            )
            .contentShape(Circle())
            .onTapGesture {
              onTapCreatePost()
            }
            .accessibilityLabel("Crear publicacion")
            .accessibilityAddTraits(.isButton)

          Spacer()

          HStack(spacing: 16) {
            secondaryIconButton(
              systemName: "sparkles",
              hint: .sparkles,
              action: onTapSparkles
            )
            secondaryIconButton(
              systemName: "bell",
              hint: .bell,
              action: onTapBell
            )
          }
          .foregroundStyle(VinctusTokens.Color.textMuted)
        }
        .frame(maxWidth: .infinity)

        Text("Vinctus")
          .font(VinctusTokens.Typography.brandTitle(size: 34))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .frame(maxWidth: .infinity, alignment: .center)
          .allowsHitTesting(false)
      }
      .padding(.top, 2)
      .padding(.bottom, showsDivider ? 9 : 4)

      if showsDivider {
        Divider()
          .background(VinctusTokens.Color.border.opacity(0.4))
      }
    }
    .alert(item: $hint) { current in
      Alert(
        title: Text("Proximamente"),
        message: Text(current.message),
        dismissButton: .default(Text("Entendido"))
      )
    }
  }

  @ViewBuilder
  private func secondaryIconButton(
    systemName: String,
    hint: HeaderHint,
    action: (() -> Void)?
  ) -> some View {
    Button {
      if let action {
        action()
      } else {
        self.hint = hint
      }
    } label: {
      Image(systemName: systemName)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(hint.accessibilityLabel)
  }
}

private enum HeaderHint: String, Identifiable {
  case sparkles
  case bell

  var id: String { rawValue }

  var accessibilityLabel: String {
    switch self {
    case .sparkles:
      return "Acciones inteligentes"
    case .bell:
      return "Notificaciones"
    }
  }

  var message: String {
    switch self {
    case .sparkles:
      return "Esta accion estara disponible en una proxima iteracion."
    case .bell:
      return "El centro de notificaciones llegara en una proxima iteracion."
    }
  }
}
