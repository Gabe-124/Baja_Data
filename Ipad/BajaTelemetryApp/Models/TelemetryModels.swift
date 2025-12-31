import Foundation
import CoreLocation

enum FixQuality: Int, Codable, CaseIterable, Identifiable {
    case none = 0
    case gps = 1
    case dgps = 2
    case rtk = 5

    var id: Int { rawValue }
    var label: String {
        switch self {
        case .none: return "No Fix"
        case .gps: return "GPS Fix"
        case .dgps: return "DGPS"
        case .rtk: return "RTK"
        }
    }
}

struct IMUData: Codable, Equatable {
    var accel: [Double]
    var gyro: [Double]
}

struct TelemetryPacket: Codable, Identifiable, Equatable {
    var id: UUID = UUID()
    var timestamp: Date
    var latitude: Double
    var longitude: Double
    var altitude: Double
    var fix: FixQuality
    var satellites: Int
    var hdop: Double
    var imu: IMUData

    init(timestamp: Date, latitude: Double, longitude: Double, altitude: Double, fix: FixQuality, satellites: Int, hdop: Double, imu: IMUData) {
        self.timestamp = timestamp
        self.latitude = latitude
        self.longitude = longitude
        self.altitude = altitude
        self.fix = fix
        self.satellites = satellites
        self.hdop = hdop
        self.imu = imu
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let tsValue = try container.decode(Double.self, forKey: .timestamp)
        self.timestamp = Date(timeIntervalSince1970: tsValue)
        self.latitude = try container.decode(Double.self, forKey: .latitude)
        self.longitude = try container.decode(Double.self, forKey: .longitude)
        self.altitude = try container.decode(Double.self, forKey: .altitude)
        self.fix = try container.decodeIfPresent(FixQuality.self, forKey: .fix) ?? .none
        self.satellites = try container.decodeIfPresent(Int.self, forKey: .satellites) ?? 0
        self.hdop = try container.decodeIfPresent(Double.self, forKey: .hdop) ?? 0
        self.imu = try container.decodeIfPresent(IMUData.self, forKey: .imu) ?? IMUData(accel: [0, 0, 0], gyro: [0, 0, 0])
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(timestamp.timeIntervalSince1970, forKey: .timestamp)
        try container.encode(latitude, forKey: .latitude)
        try container.encode(longitude, forKey: .longitude)
        try container.encode(altitude, forKey: .altitude)
        try container.encode(fix, forKey: .fix)
        try container.encode(satellites, forKey: .satellites)
        try container.encode(hdop, forKey: .hdop)
        try container.encode(imu, forKey: .imu)
    }

    var location: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}

enum TelemetrySource: String, Codable, CaseIterable, Identifiable {
    case gateway
    case httpPolling
    case simulation

    var id: String { rawValue }
    var label: String {
        switch self {
        case .gateway: return "Gateway"
        case .httpPolling: return "HTTP Poll"
        case .simulation: return "Simulation"
        }
    }
}

struct ConnectionSettings: Codable, Equatable {
    var gatewayHost: String = ""
    var gatewayPort: Int = 9000
    var telemetryPollURL: URL? = nil
    var enduranceURL: URL? = nil
    var leaderboardURL: URL? = nil
    var penaltiesURL: URL? = nil
}
