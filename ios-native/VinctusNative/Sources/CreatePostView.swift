import SwiftUI

struct CreatePostView: View {
  @StateObject private var vm: CreatePostViewModel

  init(repo: CreatePostRepo) {
    _vm = StateObject(wrappedValue: CreatePostViewModel(repo: repo))
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: VinctusTokens.Spacing.lg) {
        VCard {
          VStack(alignment: .leading, spacing: VinctusTokens.Spacing.md) {
            Text("Nuevo post")
              .font(.headline)

            Text("Semana 13: publicacion de texto (sin media).")
              .font(.footnote)
              .foregroundStyle(.secondary)

            ZStack(alignment: .topLeading) {
              if vm.draftText.isEmpty {
                Text("Comparte una idea con la comunidad...")
                  .foregroundStyle(.secondary)
                  .padding(.top, 12)
                  .padding(.leading, 10)
              }

              TextEditor(text: $vm.draftText)
                .frame(minHeight: 170)
                .padding(.horizontal, 6)
                .padding(.vertical, 8)
                .onChange(of: vm.draftText) { _, _ in
                  vm.clearFeedbackIfNeeded()
                }
            }
            .background(VinctusTokens.Color.surface2)
            .clipShape(RoundedRectangle(cornerRadius: VinctusTokens.Radius.md, style: .continuous))
            .overlay(
              RoundedRectangle(cornerRadius: VinctusTokens.Radius.md, style: .continuous)
                .stroke(
                  vm.remainingCharacters < 0
                    ? SwiftUI.Color.red.opacity(0.45)
                    : VinctusTokens.Color.border.opacity(0.35),
                  lineWidth: 1
                )
            )

            HStack {
              Text("Maximo \(vm.characterLimit) caracteres")
                .font(.caption)
                .foregroundStyle(.secondary)

              Spacer()

              Text("\(vm.remainingCharacters)")
                .font(.caption.monospacedDigit())
                .foregroundStyle(vm.remainingCharacters < 0 ? .red : .secondary)
            }

            if let error = vm.errorMessage {
              Text(error)
                .font(.footnote)
                .foregroundStyle(.red)
            }

            if let info = vm.infoMessage {
              Text(info)
                .font(.footnote)
                .foregroundStyle(VinctusTokens.Color.accent)
            }

            VStack(spacing: VinctusTokens.Spacing.sm) {
              VButton("Publicar ahora") {
                vm.submit()
              }
              .disabled(!vm.canSubmit)

              if vm.canRetryPendingSubmission {
                VButton("Reintentar envio", variant: .secondary) {
                  vm.retryPendingSubmission()
                }
              }
            }
          }
        }
      }
      .padding(VinctusTokens.Spacing.lg)
    }
    .background(SwiftUI.Color(uiColor: .systemGroupedBackground).ignoresSafeArea())
    .navigationTitle("Crear")
    .vinctusLoading(vm.isSubmitting)
  }
}
