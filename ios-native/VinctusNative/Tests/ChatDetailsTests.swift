import XCTest
@testable import VinctusNative

@MainActor
final class ChatDetailsTests: XCTestCase {
  private let now = Date(timeIntervalSince1970: 1_795_800_000)

  // MARK: Mute status

  func testMuteStatusText() {
    XCTAssertNil(ChatMuteFormat.statusText(.off, now: now))
    XCTAssertEqual(ChatMuteFormat.statusText(ChatMuteState(muted: true, mutedUntil: nil), now: now), "Silenciado")
    XCTAssertNil(
      ChatMuteFormat.statusText(ChatMuteState(muted: true, mutedUntil: now.addingTimeInterval(-60)), now: now),
      "A mute whose time passed no longer counts"
    )

    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = .current
    let soon = now.addingTimeInterval(60)
    let sameDay = ChatMuteFormat.statusText(ChatMuteState(muted: true, mutedUntil: soon), now: now, calendar: calendar)
    let laterDay = ChatMuteFormat.statusText(
      ChatMuteState(muted: true, mutedUntil: now.addingTimeInterval(3 * 86_400)), now: now, calendar: calendar
    )
    if calendar.isDate(soon, inSameDayAs: now) {
      XCTAssertTrue(sameDay?.hasPrefix("Silenciado hasta las ") == true, sameDay ?? "nil")
    }
    XCTAssertTrue(laterDay?.hasPrefix("Silenciado hasta el ") == true, laterDay ?? "nil")
  }

  func testMuteOptionsMatchTheWeb() {
    XCTAssertEqual(ChatMuteFormat.options.map(\.hours), [1, 4, 8, nil])
    XCTAssertEqual(ChatMuteFormat.options.last?.label, "Hasta que lo actives")
  }

  // MARK: Limpiar chat local

  func testClearedConversationsAreKeptPerConversation() throws {
    let suite = "ChatDetailsTests.\(UUID().uuidString)"
    let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }

    XCTAssertNil(ChatClearedStore.clearedAt("dm_a_b", defaults: defaults))
    ChatClearedStore.clear("dm_a_b", at: now, defaults: defaults)
    XCTAssertEqual(ChatClearedStore.clearedAt("dm_a_b", defaults: defaults), now)
    XCTAssertNil(ChatClearedStore.clearedAt("grp_g1", defaults: defaults))

    ChatClearedStore.restore("dm_a_b", defaults: defaults)
    XCTAssertNil(ChatClearedStore.clearedAt("dm_a_b", defaults: defaults))
  }

  // MARK: Files and search

  private func message(_ id: String, _ text: String, minutesAgo: Double, attachments: [ChatAttachment] = []) -> ChatMessage {
    ChatMessage(
      id: id, senderID: "u2", senderName: "Mateo", text: text, hasAttachments: !attachments.isEmpty,
      createdAt: now.addingTimeInterval(-minutesAgo * 60), attachments: attachments
    )
  }

  private func attachment(_ name: String, type: String) -> ChatAttachment {
    ChatAttachment(kind: type.hasPrefix("image/") ? "image" : "file", url: "https://example.com/\(name)",
                   path: "chat/\(name)", fileName: name, contentType: type, size: 1024)
  }

  func testFilesAreNewestFirstAndSplitIntoVisualAndDocuments() {
    let messages = [
      message("m1", "", minutesAgo: 30, attachments: [attachment("foto.jpg", type: "image/jpeg")]),
      message("m2", "Mira", minutesAgo: 5, attachments: [attachment("nota.pdf", type: "application/pdf")]),
      message("m3", "Hola", minutesAgo: 1),
    ]
    let files = ChatDetailsContent.files(in: messages)
    XCTAssertEqual(files.map(\.attachment.fileName), ["nota.pdf", "foto.jpg"])
    XCTAssertEqual(files.map(\.isVisual), [false, true])
  }

  func testSearchIgnoresCaseAndAccentsNewestFirst() {
    let messages = [
      message("m1", "Nos vemos el sábado", minutesAgo: 60),
      message("m2", "El SABADO llevo el telescopio", minutesAgo: 5),
      message("m3", "Domingo libre", minutesAgo: 1),
    ]
    XCTAssertEqual(ChatDetailsContent.search(messages, query: " sabado ").map(\.id), ["m2", "m1"])
    XCTAssertTrue(ChatDetailsContent.search(messages, query: "   ").isEmpty)
  }

  // MARK: View model

  private func makeViewModel(
    kind: ChatDetailsViewModel.Kind,
    chat: FakeChatRepo = FakeChatRepo(),
    groups: FakeGroupsRepo = FakeGroupsRepo()
  ) -> ChatDetailsViewModel {
    let profiles = FakeProfileRepo()
    profiles.profile = UserProfile(
      id: "u2", displayName: "Mateo Rojas", photoURL: nil, username: "mateo", email: nil, bio: nil,
      role: nil, location: nil, reputation: 0, followersCount: 0, followingCount: 0, postsCount: 0,
      accountVisibility: .public, createdAt: Date(), updatedAt: Date()
    )
    return ChatDetailsViewModel(
      kind: kind, conversationID: kind.isGroup ? "grp_g1" : "dm_me_u2",
      chatRepo: chat, profileRepo: profiles, groupsRepo: groups
    )
  }

  private func group(ownerID: String) -> GroupDetail {
    GroupDetail(
      id: "g1", name: "Jazz y café", description: "", categoryID: nil, ownerID: ownerID,
      visibility: .public, iconURL: nil, memberCount: 12, postsPerWeek: 0,
      createdAt: nil, updatedAt: nil, recentPosts: [], topMembers: [], isFromCache: false
    )
  }

  func testMutesForHoursAndUnmutes() async {
    let chat = FakeChatRepo()
    let vm = makeViewModel(kind: .direct(otherUserID: "u2"), chat: chat)
    await vm.load()
    XCTAssertEqual(vm.profile?.username, "mateo")
    XCTAssertFalse(vm.isMuted)

    let didMute = await vm.mute(hours: 4, now: now)
    XCTAssertTrue(didMute)
    XCTAssertEqual(chat.muteCalls, [now.addingTimeInterval(4 * 3600)])
    XCTAssertEqual(vm.mute, ChatMuteState(muted: true, mutedUntil: now.addingTimeInterval(4 * 3600)))

    await vm.mute(hours: nil)
    XCTAssertEqual(chat.muteCalls.last, .some(nil), "Until turned back on")
    XCTAssertEqual(vm.muteStatusText, "Silenciado")

    await vm.unmute()
    XCTAssertEqual(chat.clearMuteCalls, 1)
    XCTAssertFalse(vm.isMuted)
  }

  func testAnExpiredMuteIsClearedOnLoad() async {
    let chat = FakeChatRepo()
    chat.muteState = ChatMuteState(muted: true, mutedUntil: Date().addingTimeInterval(-3600))
    let vm = makeViewModel(kind: .direct(otherUserID: "u2"), chat: chat)
    await vm.load()
    XCTAssertEqual(chat.clearMuteCalls, 1)
    XCTAssertEqual(vm.mute, .off)
  }

  func testAFailedMuteKeepsTheStateAndExplains() async {
    let chat = FakeChatRepo()
    chat.failsToMute = true
    let vm = makeViewModel(kind: .direct(otherUserID: "u2"), chat: chat)
    let didMute = await vm.mute(hours: 1)
    XCTAssertFalse(didMute)
    XCTAssertFalse(vm.isMuted)
    XCTAssertEqual(vm.errorMessage, "No se pudo silenciar.")
  }

  func testAMemberLeavesTheGroupButTheOwnerCannot() async {
    let groups = FakeGroupsRepo()
    groups.stubDetail = group(ownerID: "owner")
    let vm = makeViewModel(kind: .group(groupID: "g1"), groups: groups)
    await vm.load()
    XCTAssertEqual(vm.group?.name, "Jazz y café")
    XCTAssertFalse(vm.isOwner(uid: "me"))

    let left = await vm.leaveGroup(uid: "me")
    XCTAssertTrue(left)
    XCTAssertEqual(groups.leaveCalls, 1)

    let ownerGroups = FakeGroupsRepo()
    ownerGroups.stubDetail = group(ownerID: "me")
    let ownerVM = makeViewModel(kind: .group(groupID: "g1"), groups: ownerGroups)
    await ownerVM.load()
    XCTAssertTrue(ownerVM.isOwner(uid: "me"))
    let ownerLeft = await ownerVM.leaveGroup(uid: "me")
    XCTAssertFalse(ownerLeft)
    XCTAssertEqual(ownerGroups.leaveCalls, 0)
  }

  // MARK: Reportar grupo

  func testAGroupReportIsBuiltLikeTheWeb() {
    let withDetails = ReportFields(target: .group(groupID: "g1"), details: " spam constante ")
    XCTAssertEqual(withDetails.reportedUID, "g1")
    XCTAssertEqual(withDetails.details, "[Grupo g1] spam constante")
    XCTAssertEqual(withDetails.conversationID, "grp_g1")

    let plain = ReportFields(target: .group(groupID: "g1"), details: nil)
    XCTAssertEqual(plain.details, "Reporte de grupo g1")
    XCTAssertEqual(ReportTarget.group(groupID: "g1").title, "Denunciar grupo")
  }
}
