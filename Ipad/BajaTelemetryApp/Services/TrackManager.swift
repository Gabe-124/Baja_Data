import Foundation
import CoreLocation

@MainActor
final class TrackManager: ObservableObject {
    @Published private(set) var reference = TrackReference()
    @Published var drawingMode: Bool = false
    @Published var walking: Bool = false

    private var lastRecordedLocation: CLLocationCoordinate2D? = nil

    func load(reference: TrackReference) {
        self.reference = reference
    }

    func clear() {
        reference = TrackReference()
    }

    func clearTrackPoints() {
        reference.points.removeAll()
        drawingMode = false
        walking = false
        lastRecordedLocation = nil
    }

    func startWalking(at coordinate: CLLocationCoordinate2D) {
        walking = true
        reference.points = [TrackPoint(coordinate: coordinate)]
        lastRecordedLocation = coordinate
    }

    func record(coordinate: CLLocationCoordinate2D) {
        guard walking else { return }
        if let last = lastRecordedLocation {
            let lastLoc = CLLocation(latitude: last.latitude, longitude: last.longitude)
            let newLoc = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
            let distance = newLoc.distance(from: lastLoc)
            if distance < 1.5 { return }
        }
        reference.points.append(TrackPoint(coordinate: coordinate))
        lastRecordedLocation = coordinate
    }

    func stopWalking(closeLoop: Bool = true) {
        walking = false
        if closeLoop, let first = reference.points.first, let last = reference.points.last {
            let firstLoc = CLLocation(latitude: first.coordinate.latitude, longitude: first.coordinate.longitude)
            let lastLoc = CLLocation(latitude: last.coordinate.latitude, longitude: last.coordinate.longitude)
            if lastLoc.distance(from: firstLoc) < 10 {
                reference.points.append(TrackPoint(coordinate: first.coordinate))
            }
        }
        simplify()
    }

    func simplify() {
        guard reference.points.count > 4 else { return }
        var simplified: [TrackPoint] = [reference.points[0]]
        for point in reference.points.dropFirst().dropLast() {
            if let last = simplified.last {
                let lastLoc = CLLocation(latitude: last.coordinate.latitude, longitude: last.coordinate.longitude)
                let curr = CLLocation(latitude: point.coordinate.latitude, longitude: point.coordinate.longitude)
                if curr.distance(from: lastLoc) > 3 { // keep points spaced
                    simplified.append(point)
                }
            }
        }
        if let last = reference.points.last { simplified.append(last) }
        reference.points = simplified
    }

    func beginDrawing() {
        drawingMode = true
        if reference.points.isEmpty, let last = lastRecordedLocation {
            reference.points.append(TrackPoint(coordinate: last))
        }
    }

    func addDrawPoint(_ coordinate: CLLocationCoordinate2D) {
        guard drawingMode else { return }
        if let last = reference.points.last {
            let lastLoc = CLLocation(latitude: last.coordinate.latitude, longitude: last.coordinate.longitude)
            let curr = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
            if curr.distance(from: lastLoc) < 1.5 { return }
        }
        reference.points.append(TrackPoint(coordinate: coordinate))
    }

    func finishDrawing() {
        drawingMode = false
        simplify()
    }

    func undoLastPoint() {
        guard !reference.points.isEmpty else { return }
        reference.points.removeLast()
        lastRecordedLocation = reference.points.last?.coordinate
    }

    func setStartFinish(at coordinate: CLLocationCoordinate2D, radius: Double = 10) {
        reference.startFinish = StartFinish(coordinate: coordinate, radiusMeters: radius)
    }

    func exportGeoJSON() -> Data? {
        guard !reference.points.isEmpty else { return nil }
        let coords = reference.points.map { [$0.coordinate.longitude, $0.coordinate.latitude] }
        let geojson: [String: Any] = [
            "type": "FeatureCollection",
            "features": [
                [
                    "type": "Feature",
                    "properties": ["name": reference.name],
                    "geometry": [
                        "type": "LineString",
                        "coordinates": coords
                    ]
                ]
            ]
        ]
        return try? JSONSerialization.data(withJSONObject: geojson, options: [.prettyPrinted])
    }

    func importGeoJSON(data: Data) {
        guard
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let features = json["features"] as? [[String: Any]],
            let first = features.first,
            let geometry = first["geometry"] as? [String: Any],
            let type = geometry["type"] as? String, type == "LineString",
            let coords = geometry["coordinates"] as? [[Double]]
        else { return }

        let points = coords.compactMap { pair -> TrackPoint? in
            guard pair.count >= 2 else { return nil }
            return TrackPoint(coordinate: CLLocationCoordinate2D(latitude: pair[1], longitude: pair[0]))
        }
        reference.points = points
    }

    func importGPX(data: Data) {
        guard let xml = String(data: data, encoding: .utf8) else { return }
        var points: [TrackPoint] = []
        xml.components(separatedBy: "<trkpt").forEach { chunk in
            guard let latRange = chunk.range(of: "lat=\"")?.upperBound,
                  let lonRange = chunk.range(of: "lon=\"")?.upperBound else { return }
            let latString = chunk[latRange...].split(separator: "\"").first
            let lonString = chunk[lonRange...].split(separator: "\"").first
            if let lat = latString.flatMap(Double.init), let lon = lonString.flatMap(Double.init) {
                points.append(TrackPoint(coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon)))
            }
        }
        if !points.isEmpty {
            reference.points = points
        }
    }
}
