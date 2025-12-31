import Foundation
import MapKit

struct Preferences: Codable, Equatable {
    var prefersDarkMode: Bool = false
    var mapType: MKMapType = .standard
    var autoFollow: Bool = true
    var startFinish: StartFinish = StartFinish()
    var lastTrack: TrackReference? = nil
    var connectionSettings: ConnectionSettings = ConnectionSettings()
}

extension MKMapType: Codable {
    private enum CodingKeys: CodingKey { case rawValue }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let rawValue = try container.decode(UInt.self, forKey: .rawValue)
        self.init(rawValue: rawValue) ?? self.init()
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(rawValue, forKey: .rawValue)
    }
}
