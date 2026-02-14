import PhotosUI
import SwiftUI

struct CreatePostHeaderRow: View {
  let onClose: () -> Void

  var body: some View {
    HStack(alignment: .center, spacing: 12) {
      Text("Crear Publicacion")
        .font(.system(size: 17, weight: .semibold, design: .serif))
        .foregroundStyle(VinctusTokens.Color.textPrimary)

      Spacer()

      Button(action: onClose) {
        Image(systemName: "xmark")
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .frame(width: 34, height: 34)
          .background(VinctusTokens.Color.surface2.opacity(0.55))
          .clipShape(Circle())
          .overlay(
            Circle()
              .stroke(VinctusTokens.Color.border.opacity(0.45), lineWidth: 1)
          )
      }
      .buttonStyle(.plain)
    }
  }
}

struct CreatePostAuthorSummaryRow: View {
  let displayName: String
  let email: String
  let authorInitial: String

  var body: some View {
    HStack(spacing: 10) {
      Circle()
        .fill(VinctusTokens.Color.accent)
        .frame(width: 46, height: 46)
        .overlay {
          Text(authorInitial)
            .font(.headline.weight(.semibold))
            .foregroundStyle(.black.opacity(0.85))
        }

      VStack(alignment: .leading, spacing: 2) {
        Text(displayName)
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .lineLimit(1)

        Text(email)
          .font(.system(size: 13))
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .lineLimit(1)
      }

      Spacer(minLength: 8)
    }
  }
}

struct CreatePostSubmissionStatusView: View {
  let uploadProgress: Double?
  let isSubmitting: Bool
  let errorMessage: String?
  let infoMessage: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      if let progress = uploadProgress, isSubmitting {
        VStack(alignment: .leading, spacing: 6) {
          ProgressView(value: progress)
            .tint(VinctusTokens.Color.accent)
          Text("Subiendo media \(Int(progress * 100))%")
            .font(.caption2)
            .foregroundStyle(VinctusTokens.Color.textMuted)
        }
      }

      if let errorMessage {
        Text(errorMessage)
          .font(.caption)
          .foregroundStyle(.red)
      }

      if let infoMessage {
        Text(infoMessage)
          .font(.caption)
          .foregroundStyle(VinctusTokens.Color.accent)
      }
    }
  }
}

struct CreatePostActionButtons: View {
  let isSubmitting: Bool
  let canSubmit: Bool
  let canRetryPendingSubmission: Bool
  let canCancelSubmission: Bool
  let onSubmit: () -> Void
  let onRetry: () -> Void
  let onCancel: () -> Void

  var body: some View {
    VStack(spacing: 10) {
      Button(action: onSubmit) {
        Text(isSubmitting ? "Publicando..." : "Publicar")
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(.black.opacity(0.9))
          .frame(maxWidth: .infinity)
          .padding(.vertical, 12)
          .background(VinctusTokens.Color.accent)
          .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
      }
      .buttonStyle(.plain)
      .opacity(canSubmit ? 1 : 0.5)
      .disabled(!canSubmit)

      if canRetryPendingSubmission {
        Button("Reintentar envio", action: onRetry)
          .font(.system(size: 14, weight: .medium))
          .foregroundStyle(VinctusTokens.Color.textPrimary)
          .frame(maxWidth: .infinity)
          .padding(.vertical, 9)
          .background(VinctusTokens.Color.surface2)
          .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
          .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
              .stroke(VinctusTokens.Color.border.opacity(0.55), lineWidth: 1)
          )
          .buttonStyle(.plain)
      }

      if canCancelSubmission {
        Button("Cancelar envio", action: onCancel)
          .font(.system(size: 14, weight: .medium))
          .foregroundStyle(VinctusTokens.Color.textMuted)
          .frame(maxWidth: .infinity)
          .padding(.vertical, 9)
          .background(VinctusTokens.Color.surface2.opacity(0.65))
          .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
          .buttonStyle(.plain)
      }
    }
  }
}

struct CreatePostMediaComposer: View {
  @Binding var photoSelections: [PhotosPickerItem]
  @Binding var videoSelections: [PhotosPickerItem]
  let attachments: [CreatePostDraftAttachment]
  let remainingAttachmentSlots: Int
  let maxAttachmentCount: Int
  let canAddMoreAttachments: Bool
  let canUseCamera: Bool
  let isSubmitting: Bool
  let onTapFiles: () -> Void
  let onTapCamera: () -> Void
  let onRemoveAttachment: (UUID) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Divider()
        .overlay(VinctusTokens.Color.border.opacity(0.35))

      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 8) {
          PhotosPicker(
            selection: $photoSelections,
            maxSelectionCount: remainingAttachmentSlots,
            matching: .images
          ) {
            CreatePostToolbarAction(title: "Imagenes", systemImage: "photo")
          }
          .buttonStyle(.plain)
          .disabled(!canAddMoreAttachments)

          PhotosPicker(
            selection: $videoSelections,
            maxSelectionCount: remainingAttachmentSlots,
            matching: .videos
          ) {
            CreatePostToolbarAction(title: "Videos", systemImage: "film")
          }
          .buttonStyle(.plain)
          .disabled(!canAddMoreAttachments || isSubmitting)

          Button(action: onTapFiles) {
            CreatePostToolbarAction(title: "Archivos", systemImage: "doc.text")
          }
          .buttonStyle(.plain)
          .disabled(isSubmitting)

          if canUseCamera {
            Button(action: onTapCamera) {
              CreatePostToolbarAction(title: "Camara", systemImage: "camera")
            }
            .buttonStyle(.plain)
            .disabled(!canAddMoreAttachments || isSubmitting)
          }
        }
        .padding(.vertical, 2)
      }

      HStack {
        Text("Media: \(attachments.count)/\(maxAttachmentCount)")
          .font(.caption2)
          .foregroundStyle(VinctusTokens.Color.textMuted)
        Spacer()
        Text("JPG < 10MB · MP4 < 100MB · FILE < 25MB")
          .font(.caption2)
          .foregroundStyle(VinctusTokens.Color.textMuted)
      }

      if !attachments.isEmpty {
        CreatePostAttachmentsStrip(
          attachments: attachments,
          isSubmitting: isSubmitting,
          onRemoveAttachment: onRemoveAttachment
        )
      }
    }
  }
}

private struct CreatePostAttachmentsStrip: View {
  let attachments: [CreatePostDraftAttachment]
  let isSubmitting: Bool
  let onRemoveAttachment: (UUID) -> Void

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 10) {
        ForEach(attachments) { attachment in
          ZStack(alignment: .topTrailing) {
            Image(uiImage: attachment.previewImage)
              .resizable()
              .scaledToFill()
              .frame(width: 98, height: 98)
              .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
              .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                  .stroke(VinctusTokens.Color.border.opacity(0.6), lineWidth: 1)
              )

            Button {
              onRemoveAttachment(attachment.id)
            } label: {
              Image(systemName: "xmark.circle.fill")
                .font(.title3)
                .foregroundStyle(.white.opacity(0.95), .black.opacity(0.55))
            }
            .buttonStyle(.plain)
            .padding(4)
            .disabled(isSubmitting)
          }
        }
      }
      .padding(.vertical, 2)
    }
  }
}

struct CreatePostToolbarAction: View {
  let title: String
  let systemImage: String

  var body: some View {
    HStack(spacing: 6) {
      Image(systemName: systemImage)
      Text(title)
        .font(.system(size: 13, weight: .medium))
    }
    .foregroundStyle(VinctusTokens.Color.textPrimary.opacity(0.9))
    .padding(.horizontal, 10)
    .padding(.vertical, 7)
    .background(VinctusTokens.Color.surface2.opacity(0.82))
    .clipShape(Capsule())
    .overlay(
      Capsule()
        .stroke(VinctusTokens.Color.border.opacity(0.5), lineWidth: 1)
    )
  }
}
