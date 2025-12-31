import Foundation
import CoreLocation

struct Lap: Codable, Identifiable, Equatable {
    var id: UUID = UUID()
    var startTime: Date
    var endTime: Date
    var duration: TimeInterval
    var deltaToBest: TimeInterval?
    var track: TrackReference?

    var formatted: String { duration.timeString }
}

extension TimeInterval {
    var timeString: String {
        let totalMs = Int((self * 1000).rounded())
        let hours = totalMs / 3_600_000
        let minutes = (totalMs % 3_600_000) / 60_000
        let seconds = (totalMs % 60_000) / 1000
        let millis = totalMs % 1000
        if hours > 0 {
            return String(format: "%d:%02d:%02d.%03d", hours, minutes, seconds, millis)
        }
        return String(format: "%d:%02d.%03d", minutes, seconds, millis)
    }
}

extension CLLocationDistance {
    var metersString: String {
        String(format: "%.1f m", self)
    }
}
