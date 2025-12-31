import Foundation
import CoreLocation

@MainActor
final class LapTimer: ObservableObject {
    @Published private(set) var laps: [Lap] = []
    @Published var lastCrossing: Date? = nil

    private var currentLapStart: Date? = nil
    private var wasInsideGate: Bool = false
    private let minLapTime: TimeInterval = 8

    func reset() {
        laps = []
        currentLapStart = nil
        lastCrossing = nil
        wasInsideGate = false
    }

    func restore(_ stored: [Lap]) {
        laps = stored
    }

    func ingest(packet: TelemetryPacket, startFinish: StartFinish) {
        guard startFinish.radiusMeters > 0 else { return }
        let coord = CLLocation(latitude: packet.latitude, longitude: packet.longitude)
        let gate = CLLocation(latitude: startFinish.coordinate.latitude, longitude: startFinish.coordinate.longitude)
        let inside = coord.distance(from: gate) <= startFinish.radiusMeters

        if currentLapStart == nil {
            currentLapStart = packet.timestamp
        }

        if inside && !wasInsideGate {
            if let start = currentLapStart {
                let duration = packet.timestamp.timeIntervalSince(start)
                if duration >= minLapTime {
                    let lap = Lap(startTime: start, endTime: packet.timestamp, duration: duration, deltaToBest: nil, track: nil)
                    laps.append(updateDelta(for: lap))
                    lastCrossing = packet.timestamp
                    currentLapStart = packet.timestamp
                }
            }
        }
        wasInsideGate = inside
    }

    private func updateDelta(for lap: Lap) -> Lap {
        var lap = lap
        if let best = laps.map({ $0.duration }).min() {
            lap.deltaToBest = lap.duration - best
        } else {
            lap.deltaToBest = 0
        }
        return lap
    }

    var bestLap: Lap? { laps.min { $0.duration < $1.duration } }
}
