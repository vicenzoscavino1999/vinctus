import Foundation

/// "Silenciar": the choices and the status line, like the web's `model/chatDetails.ts`.
enum ChatMuteFormat {
  struct Option: Identifiable, Hashable {
    let hours: Int?
    let label: String
    var id: String { label }
  }

  static let options: [Option] = [
    Option(hours: 1, label: "1 hora"),
    Option(hours: 4, label: "4 horas"),
    Option(hours: 8, label: "8 horas"),
    Option(hours: nil, label: "Hasta que lo actives"),
  ]

  /// "Silenciado", "Silenciado hasta las 14:30" or "Silenciado hasta el vie 09:00"; nil if not muted.
  static func statusText(_ state: ChatMuteState, now: Date = Date(), calendar: Calendar = .current) -> String? {
    guard state.isActive(now: now) else { return nil }
    guard let until = state.mutedUntil else { return "Silenciado" }
    let time = until.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits).locale(Locale(identifier: "es_ES")))
    if calendar.isDate(until, inSameDayAs: now) { return "Silenciado hasta las \(time)" }
    let day = until.formatted(.dateTime.weekday(.abbreviated).locale(Locale(identifier: "es_ES")))
      .replacingOccurrences(of: ".", with: "")
    return "Silenciado hasta el \(day) \(time)"
  }
}

/// "Limpiar chat local": hides a conversation's messages up to a moment on this device only, like
/// the web's `vinctus:clearedConversations`. Nothing is deleted from the server.
enum ChatClearedStore {
  static let defaultsKey = "vinctus.clearedConversations"

  static func clearedAt(_ conversationID: String, defaults: UserDefaults = .standard) -> Date? {
    guard let seconds = (defaults.dictionary(forKey: defaultsKey) as? [String: Double])?[conversationID] else {
      return nil
    }
    return Date(timeIntervalSince1970: seconds)
  }

  static func clear(_ conversationID: String, at date: Date = Date(), defaults: UserDefaults = .standard) {
    var all = defaults.dictionary(forKey: defaultsKey) as? [String: Double] ?? [:]
    all[conversationID] = date.timeIntervalSince1970
    defaults.set(all, forKey: defaultsKey)
  }

  static func restore(_ conversationID: String, defaults: UserDefaults = .standard) {
    var all = defaults.dictionary(forKey: defaultsKey) as? [String: Double] ?? [:]
    all[conversationID] = nil
    defaults.set(all, forKey: defaultsKey)
  }
}

/// Files and search over the loaded messages of a conversation.
enum ChatDetailsContent {
  struct File: Identifiable, Hashable {
    let messageID: String
    let createdAt: Date
    let attachment: ChatAttachment
    var id: String { "\(messageID)_\(attachment.path)" }
    var isVisual: Bool { attachment.mediaKind == .image || attachment.mediaKind == .video }
  }

  /// The attachments, newest first.
  static func files(in messages: [ChatMessage]) -> [File] {
    messages
      .sorted { $0.createdAt > $1.createdAt }
      .flatMap { message in
        message.attachments.map { File(messageID: message.id, createdAt: message.createdAt, attachment: $0) }
      }
  }

  /// Messages whose text contains the query, ignoring case and accents, newest first.
  static func search(_ messages: [ChatMessage], query: String) -> [ChatMessage] {
    let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !needle.isEmpty else { return [] }
    return messages
      .filter { $0.text.range(of: needle, options: [.caseInsensitive, .diacriticInsensitive]) != nil }
      .sorted { $0.createdAt > $1.createdAt }
  }
}

/// The details of a conversation: the person or the group, and the mute.
@MainActor
final class ChatDetailsViewModel: ObservableObject {
  enum Kind: Equatable {
    case direct(otherUserID: String)
    case group(groupID: String)

    var isGroup: Bool {
      if case .group = self { return true }
      return false
    }
  }

  @Published private(set) var mute = ChatMuteState.off
  @Published private(set) var isUpdatingMute = false
  @Published private(set) var profile: UserProfile?
  @Published private(set) var group: GroupDetail?
  @Published private(set) var isLeaving = false
  @Published var errorMessage: String?

  let kind: Kind
  let conversationID: String
  private let chatRepo: ChatRepo
  private let profileRepo: ProfileRepo
  private let groupsRepo: any GroupsRepo

  init(kind: Kind, conversationID: String, chatRepo: ChatRepo, profileRepo: ProfileRepo, groupsRepo: any GroupsRepo) {
    self.kind = kind
    self.conversationID = conversationID
    self.chatRepo = chatRepo
    self.profileRepo = profileRepo
    self.groupsRepo = groupsRepo
  }

  var muteStatusText: String? { ChatMuteFormat.statusText(mute) }
  var isMuted: Bool { mute.isActive() }

  func isOwner(uid: String?) -> Bool {
    guard let uid, let ownerID = group?.ownerID else { return false }
    return ownerID == uid
  }

  /// The person or the group, and the mute. A mute whose time passed is cleared, like the web.
  func load() async {
    await loadMute()
    switch kind {
    case let .direct(otherUserID):
      profile = try? await profileRepo.fetchUserProfile(uid: otherUserID)
    case let .group(groupID):
      group = try? await groupsRepo.fetchGroupDetail(groupID: groupID, recentPostLimit: 1, topMemberLimit: 1)
    }
  }

  private func loadMute() async {
    guard let state = try? await chatRepo.fetchMute(conversationID: conversationID) else { return }
    if state.muted, !state.isActive() {
      try? await chatRepo.clearMute(conversationID: conversationID)
      mute = .off
    } else {
      mute = state
    }
  }

  /// Returns whether it worked.
  @discardableResult
  func mute(hours: Int?, now: Date = Date()) async -> Bool {
    isUpdatingMute = true
    defer { isUpdatingMute = false }
    let until = hours.map { now.addingTimeInterval(TimeInterval($0) * 3600) }
    do {
      try await chatRepo.setMute(conversationID: conversationID, until: until)
      mute = ChatMuteState(muted: true, mutedUntil: until)
      errorMessage = nil
      return true
    } catch {
      errorMessage = "No se pudo silenciar."
      return false
    }
  }

  func unmute() async {
    isUpdatingMute = true
    defer { isUpdatingMute = false }
    do {
      try await chatRepo.clearMute(conversationID: conversationID)
      mute = .off
      errorMessage = nil
    } catch {
      errorMessage = "No se pudo quitar el silencio."
    }
  }

  /// Returns whether the user left the group. The owner cannot leave (the web hides it too).
  func leaveGroup(uid: String?) async -> Bool {
    guard case let .group(groupID) = kind, let uid, !isOwner(uid: uid) else { return false }
    isLeaving = true
    defer { isLeaving = false }
    do {
      try await groupsRepo.leaveGroup(groupID: groupID, uid: uid)
      return true
    } catch {
      errorMessage = "No se pudo salir del grupo."
      return false
    }
  }
}
