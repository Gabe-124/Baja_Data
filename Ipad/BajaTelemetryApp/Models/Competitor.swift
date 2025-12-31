import Foundation

struct Competitor: Identifiable, Codable, Equatable {
    var id: UUID = UUID()
    var team: String
    var bestLap: TimeInterval
}
