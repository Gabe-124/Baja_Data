import Foundation
import CoreLocation

protocol TelemetryProvider: AnyObject {
    var label: String { get }
    func start() -> AsyncStream<TelemetryPacket>
    func stop()
}

final class SimulationTelemetryProvider: TelemetryProvider {
    let label = "Simulation"
    private var task: Task<Void, Never>?
    private let center = CLLocationCoordinate2D(latitude: 36.0000, longitude: -121.0000)
    private let radiusMeters: Double = 120
    private let updateHz: Double = 5

    func start() -> AsyncStream<TelemetryPacket> {
        AsyncStream { continuation in
            var theta: Double = 0
            let step = (2 * Double.pi) / (updateHz * 60) // 60 s loop
            task = Task { [weak self] in
                guard let self else { return }
                while !Task.isCancelled {
                    theta += step
                    let jitterLat = Double.random(in: -0.00002...0.00002)
                    let jitterLon = Double.random(in: -0.00002...0.00002)
                    let dLat = (radiusMeters / 111_320) * cos(theta)
                    let dLon = (radiusMeters / (111_320 * cos(center.latitude * .pi / 180))) * sin(theta)
                    let coord = CLLocationCoordinate2D(latitude: center.latitude + dLat + jitterLat, longitude: center.longitude + dLon + jitterLon)
                    let packet = TelemetryPacket(
                        timestamp: Date(),
                        latitude: coord.latitude,
                        longitude: coord.longitude,
                        altitude: 30 + Double.random(in: -2...2),
                        fix: .gps,
                        satellites: Int.random(in: 10...18),
                        hdop: Double.random(in: 0.6...1.5),
                        imu: IMUData(accel: [0.01, 0.03, 1.0], gyro: [0, 0, 0])
                    )
                    continuation.yield(packet)
                    try? await Task.sleep(nanoseconds: UInt64(1_000_000_000 / updateHz))
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in
                self.task?.cancel()
            }
        }
    }

    func stop() {
        task?.cancel()
    }
}

final class GatewayTelemetryProvider: TelemetryProvider {
    let label = "Gateway"
    private var task: URLSessionWebSocketTask?
    private let url: URL

    init(host: String, port: Int) {
        self.url = URL(string: "ws://\(host):\(port)") ?? URL(string: "ws://localhost:9000")!
    }

    func start() -> AsyncStream<TelemetryPacket> {
        AsyncStream { continuation in
            let session = URLSession(configuration: .default)
            let socket = session.webSocketTask(with: url)
            self.task = socket
            socket.resume()

            func receive() {
                socket.receive { result in
                    switch result {
                    case .failure(let error):
                        continuation.yield(with: .failure(error))
                        continuation.finish()
                    case .success(let message):
                        switch message {
                        case .string(let text):
                            if let data = text.data(using: .utf8), let packet = try? JSONDecoder().decode(TelemetryPacket.self, from: data) {
                                continuation.yield(packet)
                            }
                        case .data(let data):
                            if let packet = try? JSONDecoder().decode(TelemetryPacket.self, from: data) {
                                continuation.yield(packet)
                            }
                        @unknown default:
                            break
                        }
                        receive()
                    }
                }
            }

            receive()
            continuation.onTermination = { _ in
                socket.cancel(with: .goingAway, reason: nil)
            }
        }
    }

    func stop() {
        task?.cancel(with: .goingAway, reason: nil)
    }
}

final class HTTPPollingTelemetryProvider: TelemetryProvider {
    let label = "HTTP Poll"
    private var task: Task<Void, Never>?
    private let url: URL
    private let pollInterval: TimeInterval

    init(url: URL, pollInterval: TimeInterval = 1.0) {
        self.url = url
        self.pollInterval = pollInterval
    }

    func start() -> AsyncStream<TelemetryPacket> {
        AsyncStream { continuation in
            task = Task {
                let decoder = JSONDecoder()
                while !Task.isCancelled {
                    do {
                        let (data, _) = try await URLSession.shared.data(from: url)
                        if let packet = try? decoder.decode(TelemetryPacket.self, from: data) {
                            continuation.yield(packet)
                        }
                    } catch {
                        continuation.yield(with: .failure(error))
                    }
                    try? await Task.sleep(nanoseconds: UInt64(pollInterval * 1_000_000_000))
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in
                self.task?.cancel()
            }
        }
    }

    func stop() {
        task?.cancel()
    }
}
