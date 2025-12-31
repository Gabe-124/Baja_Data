import Foundation

enum RaceStatus: String, Codable {
    case waiting
    case running
    case complete
}

struct RaceClockState: Codable, Equatable {
    var officialStart: Date? = nil
    var duration: TimeInterval = 4 * 60 * 60
    var offset: TimeInterval = 0
    var status: RaceStatus = .waiting

    var remaining: TimeInterval {
        guard let start = officialStart else { return duration + offset }
        let elapsed = Date().timeIntervalSince(start) + offset
        return max(0, duration - elapsed)
    }
}

@MainActor
final class RaceClockService: ObservableObject {
    @Published var state = RaceClockState()
    private var timer: Timer?

    func startRace() {
        state.officialStart = Date()
        state.status = .running
        startTimer()
    }

    func applyAdjustment(seconds: TimeInterval) {
        state.offset += seconds
        if state.status == .waiting {
            state.status = .running
            startTimer()
        }
    }

    func reset() {
        timer?.invalidate()
        state = RaceClockState()
    }

    private func startTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            guard let self else { return }
            if state.remaining <= 0 {
                state.status = .complete
                timer?.invalidate()
            }
            self.objectWillChange.send()
        }
    }
}
