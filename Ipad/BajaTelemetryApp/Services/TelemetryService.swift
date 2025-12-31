import Foundation
import Combine

@MainActor
final class TelemetryService: ObservableObject {
    @Published var currentPacket: TelemetryPacket? = nil
    @Published var lastError: String? = nil
    @Published var isConnected: Bool = false
    @Published var source: TelemetrySource = .simulation

    private var provider: TelemetryProvider?
    private var streamTask: Task<Void, Never>?

    func connect(settings: ConnectionSettings) {
        disconnect()
        switch source {
        case .simulation:
            provider = SimulationTelemetryProvider()
        case .gateway:
            provider = GatewayTelemetryProvider(host: settings.gatewayHost, port: settings.gatewayPort)
        case .httpPolling:
            if let url = settings.telemetryPollURL {
                provider = HTTPPollingTelemetryProvider(url: url)
            }
        }

        guard let provider else {
            lastError = "No provider"
            return
        }

        let stream = provider.start()
        isConnected = true
        streamTask = Task { [weak self] in
            for await result in stream {
                guard let self else { return }
                if Task.isCancelled { break }
                self.currentPacket = result
            }
            await MainActor.run {
                self?.isConnected = false
            }
        }
    }

    func disconnect() {
        streamTask?.cancel()
        streamTask = nil
        provider?.stop()
        provider = nil
        isConnected = false
    }

    func reconnect(settings: ConnectionSettings) {
        connect(settings: settings)
    }
}
