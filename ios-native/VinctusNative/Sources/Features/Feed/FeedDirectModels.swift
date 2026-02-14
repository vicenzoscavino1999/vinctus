import Foundation

struct FeedDirectThreadRoute: Identifiable, Hashable {
  let conversationID: String
  let participant: ChatPublicUser

  var id: String { conversationID }
}
