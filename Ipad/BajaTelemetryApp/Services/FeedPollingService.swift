import Foundation

@MainActor
final class FeedPollingService: ObservableObject {
    @Published var statuses: [FeedStatus] = FeedType.allCases.map { FeedStatus(id: $0) }

    private var tasks: [FeedType: Task<Void, Never>] = [:]

    func status(for type: FeedType) -> FeedStatus {
        statuses.first { $0.id == type } ?? FeedStatus(id: type)
    }

    func start(type: FeedType, url: URL, interval: TimeInterval = 2.0) {
        stop(type: type)
        updateStatus(type) { status in
            status.running = true
            status.lastError = nil
        }
        let decoder = JSONSerialization.self
        tasks[type] = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                do {
                    let (data, _) = try await URLSession.shared.data(from: url)
                    let payloadString: String
                    if let json = try? decoder.jsonObject(with: data), let pretty = try? JSONSerialization.data(withJSONObject: json, options: [.prettyPrinted]), let str = String(data: pretty, encoding: .utf8) {
                        payloadString = str
                    } else {
                        payloadString = String(data: data, encoding: .utf8) ?? ""
                    }
                    updateStatus(type) { status in
                        status.lastPayload = payloadString
                        status.lastUpdated = Date()
                        status.lastError = nil
                    }
                } catch {
                    updateStatus(type) { status in
                        status.lastError = error.localizedDescription
                    }
                }
                try? await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))
            }
        }
    }

    func stop(type: FeedType) {
        tasks[type]?.cancel()
        tasks[type] = nil
        updateStatus(type) { status in
            status.running = false
        }
    }

    func injectMock(type: FeedType, payload: String) {
        updateStatus(type) { status in
            status.lastPayload = payload
            status.lastUpdated = Date()
            status.lastError = nil
        }
    }

    private func updateStatus(_ type: FeedType, mutate: (inout FeedStatus) -> Void) {
        if let idx = statuses.firstIndex(where: { $0.id == type }) {
            mutate(&statuses[idx])
        } else {
            var status = FeedStatus(id: type)
            mutate(&status)
            statuses.append(status)
        }
    }
}
