import Foundation

enum FeedType: String, CaseIterable, Identifiable, Codable {
    case endurance
    case leaderboard
    case penalties

    var id: String { rawValue }
    var label: String {
        switch self {
        case .endurance: return "Endurance"
        case .leaderboard: return "Leaderboard"
        case .penalties: return "Penalties"
        }
    }
}

struct FeedStatus: Codable, Identifiable, Equatable {
    var id: FeedType
    var running: Bool = false
    var lastUpdated: Date? = nil
    var lastError: String? = nil
    var lastPayload: String? = nil
}
