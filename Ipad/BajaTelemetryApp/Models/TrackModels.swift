import Foundation
import CoreLocation

struct TrackPoint: Codable, Identifiable, Equatable {
    var id: UUID = UUID()
    var coordinate: CLLocationCoordinate2D
    var timestamp: Date
    var altitude: Double?

    init(coordinate: CLLocationCoordinate2D, timestamp: Date = Date(), altitude: Double? = nil) {
        self.coordinate = coordinate
        self.timestamp = timestamp
        self.altitude = altitude
    }

    enum CodingKeys: CodingKey { case latitude, longitude, timestamp, altitude }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let latitude = try container.decode(Double.self, forKey: .latitude)
        let longitude = try container.decode(Double.self, forKey: .longitude)
        self.coordinate = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
        self.timestamp = try container.decode(Date.self, forKey: .timestamp)
        self.altitude = try container.decodeIfPresent(Double.self, forKey: .altitude)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(coordinate.latitude, forKey: .latitude)
        try container.encode(coordinate.longitude, forKey: .longitude)
        try container.encode(timestamp, forKey: .timestamp)
        try container.encode(altitude, forKey: .altitude)
    }
}

struct StartFinish: Codable, Equatable {
    var coordinate: CLLocationCoordinate2D
    var radiusMeters: Double

    init(coordinate: CLLocationCoordinate2D = CLLocationCoordinate2D(latitude: 0, longitude: 0), radiusMeters: Double = 10) {
        self.coordinate = coordinate
        self.radiusMeters = radiusMeters
    }

    enum CodingKeys: CodingKey { case latitude, longitude, radiusMeters }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let latitude = try container.decode(Double.self, forKey: .latitude)
        let longitude = try container.decode(Double.self, forKey: .longitude)
        self.coordinate = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
        self.radiusMeters = try container.decode(Double.self, forKey: .radiusMeters)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(coordinate.latitude, forKey: .latitude)
        try container.encode(coordinate.longitude, forKey: .longitude)
        try container.encode(radiusMeters, forKey: .radiusMeters)
    }
}

struct TrackReference: Codable, Equatable, Identifiable {
    var id: UUID = UUID()
    var name: String = "Reference Track"
    var points: [TrackPoint] = []
    var startFinish: StartFinish = StartFinish()
    var createdAt: Date = Date()

    var isEmpty: Bool { points.isEmpty }
}
