import Foundation
import Combine
import CoreLocation
import MapKit

@MainActor
final class AppViewModel: ObservableObject {
    @Published var preferences: Preferences = Preferences()
    @Published var telemetry: TelemetryPacket? = nil
    @Published var laps: [Lap] = []
    @Published var feedStatuses: [FeedStatus] = []
    @Published var isSimulating: Bool = false
    @Published var connectionSettings: ConnectionSettings = ConnectionSettings()
    @Published var selectedSource: TelemetrySource = .simulation
    @Published var trackReference: TrackReference = TrackReference()
    @Published var competitors: [Competitor] = []
    @Published var isTestTxRunning: Bool = false
    @Published var showSettingsSheet: Bool = false
    @Published var connectionError: String? = nil
    @Published var mapFollow: Bool = true
    @Published var mapStyle: MKMapType = .standard

    let telemetryService = TelemetryService()
    let lapTimer = LapTimer()
    let raceClock = RaceClockService()
    let feedService = FeedPollingService()
    let trackManager = TrackManager()
    private let persistence = PersistenceStore()
    private var testTxTask: Task<Void, Never>? = nil

    private var cancellables: Set<AnyCancellable> = []

    init() {
        loadPersisted()
        bind()
    }

    private func bind() {
        telemetryService.$currentPacket
            .receive(on: DispatchQueue.main)
            .sink { [weak self] packet in
                guard let self else { return }
                telemetry = packet
                if let packet {
                    trackManager.record(coordinate: packet.location)
                    lapTimer.ingest(packet: packet, startFinish: trackManager.reference.startFinish)
                    laps = lapTimer.laps
                }
            }
            .store(in: &cancellables)

        feedService.$statuses
            .receive(on: DispatchQueue.main)
            .assign(to: &self.$feedStatuses)
    }

    func connect() {
        telemetryService.source = selectedSource
        telemetryService.connect(settings: connectionSettings)
        mapFollow = preferences.autoFollow
    }

    func disconnect() {
        telemetryService.disconnect()
    }

    func reconnect() {
        telemetryService.reconnect(settings: connectionSettings)
    }

    func toggleSimulation() {
        selectedSource = .simulation
        isSimulating.toggle()
        if isTestTxRunning { stopTestTx() }
        if isSimulating {
            connect()
        } else {
            disconnect()
        }
    }

    func startRaceClock() {
        raceClock.startRace()
    }

    func adjustRaceClock(seconds: TimeInterval) {
        raceClock.applyAdjustment(seconds: seconds)
    }

    func toggleTestTx() {
        if isTestTxRunning {
            stopTestTx()
        } else {
            startTestTx()
        }
    }

    private func startTestTx() {
        guard !isTestTxRunning else { return }
        isTestTxRunning = true
        let center = trackManager.reference.startFinish.coordinate.latitude == 0 && trackManager.reference.startFinish.coordinate.longitude == 0 ? CLLocationCoordinate2D(latitude: 36.0, longitude: -121.0) : trackManager.reference.startFinish.coordinate
        let radius: Double = 90
        testTxTask = Task { [weak self] in
            guard let self else { return }
            let steps = 140
            for step in 0..<steps {
                if Task.isCancelled { break }
                let theta = (Double(step) / Double(steps)) * 2 * Double.pi
                let dLat = (radius / 111_320) * cos(theta)
                let dLon = (radius / (111_320 * cos(center.latitude * .pi / 180))) * sin(theta)
                let coord = CLLocationCoordinate2D(latitude: center.latitude + dLat, longitude: center.longitude + dLon)
                let packet = TelemetryPacket(
                    timestamp: Date(),
                    latitude: coord.latitude,
                    longitude: coord.longitude,
                    altitude: 25 + Double.random(in: -1...1),
                    fix: .gps,
                    satellites: 14,
                    hdop: 0.9,
                    imu: IMUData(accel: [0.02, 0.01, 1.0], gyro: [0, 0, 0])
                )
                await MainActor.run {
                    telemetry = packet
                    trackManager.record(coordinate: packet.location)
                    lapTimer.ingest(packet: packet, startFinish: trackManager.reference.startFinish)
                    laps = lapTimer.laps
                }
                try? await Task.sleep(nanoseconds: 200_000_000)
            }
            await MainActor.run {
                self.isTestTxRunning = false
                self.testTxTask = nil
            }
        }
    }

    private func stopTestTx() {
        testTxTask?.cancel()
        testTxTask = nil
        isTestTxRunning = false
    }

    func startFeed(_ type: FeedType) {
        guard let url = url(for: type) else { return }
        feedService.start(type: type, url: url)
    }

    func stopFeed(_ type: FeedType) {
        feedService.stop(type: type)
    }

    func injectMock(feed: FeedType, payload: String) {
        feedService.injectMock(type: feed, payload: payload)
    }

    private func url(for type: FeedType) -> URL? {
        switch type {
        case .endurance: return connectionSettings.enduranceURL
        case .leaderboard: return connectionSettings.leaderboardURL
        case .penalties: return connectionSettings.penaltiesURL
        }
    }

    func setMapType(_ type: MKMapType) {
        mapStyle = type
        preferences.mapType = type
        persist()
    }

    func toggleFollow(_ enabled: Bool) {
        mapFollow = enabled
        preferences.autoFollow = enabled
        persist()
    }

    func setStartFinish(at coordinate: CLLocationCoordinate2D, radius: Double) {
        trackManager.setStartFinish(at: coordinate, radius: radius)
        trackReference = trackManager.reference
        preferences.startFinish = trackManager.reference.startFinish
        persist()
    }

    func beginWalkTrack(at coordinate: CLLocationCoordinate2D) {
        trackManager.startWalking(at: coordinate)
        trackReference = trackManager.reference
    }

    func stopWalkTrack() {
        trackManager.stopWalking()
        trackReference = trackManager.reference
        preferences.lastTrack = trackManager.reference
        persist()
    }

    func toggleDrawing() {
        if trackManager.drawingMode {
            trackManager.finishDrawing()
        } else {
            trackManager.beginDrawing()
        }
        trackReference = trackManager.reference
        preferences.lastTrack = trackManager.reference
        persist()
    }

    func importTrack(from data: Data, type: String) {
        if type.contains("gpx") {
            trackManager.importGPX(data: data)
        } else {
            trackManager.importGeoJSON(data: data)
        }
        trackReference = trackManager.reference
        preferences.lastTrack = trackManager.reference
        persist()
    }

    func exportTrack() -> Data? {
        trackManager.exportGeoJSON()
    }

    func exportLapsJSON() -> Data? {
        guard !laps.isEmpty else { return nil }
        return try? JSONEncoder().encode(laps)
    }

    func importCompetitorsCSV(_ csv: String) {
        var rows: [Competitor] = []
        csv.split(whereSeparator: { $0.isNewline }).forEach { line in
            let parts = line.split(separator: ",")
            if parts.count >= 2, let time = TimeInterval(parts[1]) {
                rows.append(Competitor(team: String(parts[0]), bestLap: time))
            }
        }
        competitors = rows
        persistence.save(competitors, as: "competitors.json")
    }

    func persist() {
        persistence.save(preferences, as: "preferences.json")
        persistence.save(trackReference, as: "track.json")
        persistence.save(laps, as: "laps.json")
        persistence.save(competitors, as: "competitors.json")
    }

    private func loadPersisted() {
        if let prefs: Preferences = persistence.load(Preferences.self, from: "preferences.json") {
            preferences = prefs
            mapStyle = prefs.mapType
            connectionSettings = prefs.connectionSettings
            mapFollow = prefs.autoFollow
            if let track = prefs.lastTrack {
                trackManager.load(reference: track)
                trackReference = track
            }
        }
        if let storedLaps: [Lap] = persistence.load([Lap].self, from: "laps.json") {
            laps = storedLaps
            lapTimer.reset()
            lapTimer.restore(storedLaps)
        }
        if let storedCompetitors: [Competitor] = persistence.load([Competitor].self, from: "competitors.json") {
            competitors = storedCompetitors
        }
    }
}
