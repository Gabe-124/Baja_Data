import SwiftUI
import MapKit
import UIKit

struct TrackToolsPanel: View {
    @EnvironmentObject var viewModel: AppViewModel
    @ObservedObject var trackManager: TrackManager
    @Binding var camera: MapCameraPosition
    var proxy: MapProxy?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Button("Track Center") { centerOnTrack() }
                Button("Car Follow") { snapToCar() }
                Button(viewModel.mapStyle == .satellite ? "Street" : "Satellite") {
                    viewModel.setMapType(viewModel.mapStyle == .satellite ? .standard : .satellite)
                }
                Toggle("Auto-Follow", isOn: $viewModel.mapFollow)
                    .toggleStyle(.switch)
                    .frame(maxWidth: 160)
            }
            HStack {
                Button(trackManager.walking ? "Stop Walk" : "Walk Track") {
                    if trackManager.walking {
                        viewModel.stopWalkTrack()
                    } else if let loc = viewModel.telemetry?.location {
                        viewModel.beginWalkTrack(at: loc)
                    }
                }
                Button(trackManager.drawingMode ? "Exit Draw" : "Draw/Edit") {
                    viewModel.toggleDrawing()
                }
                if trackManager.drawingMode {
                    Button("Finish Draw") {
                        trackManager.finishDrawing()
                        viewModel.trackReference = trackManager.reference
                        viewModel.preferences.lastTrack = trackManager.reference
                        viewModel.persist()
                    }
                }
                Button("Undo Point") {
                    trackManager.undoLastPoint()
                    viewModel.trackReference = trackManager.reference
                    viewModel.preferences.lastTrack = trackManager.reference
                    viewModel.persist()
                }
                Button("Clear Track") {
                    trackManager.clearTrackPoints()
                    viewModel.trackReference = trackManager.reference
                    viewModel.preferences.lastTrack = trackManager.reference
                    viewModel.persist()
                }
                Button("Save Track") {
                    if let data = viewModel.exportTrack() {
                        let tmp = URL.temporaryDirectory.appendingPathComponent("track.geojson")
                        try? data.write(to: tmp)
                        Task { await share(url: tmp) }
                    }
                }
                Button("Import Track") {
                    // handled by parent fileImporter toggle
                    NotificationCenter.default.post(name: .init("OpenTrackImporter"), object: nil)
                }
                Stepper("Radius: \(Int(trackManager.reference.startFinish.radiusMeters)) m", value: Binding(get: {
                    Int(trackManager.reference.startFinish.radiusMeters)
                }, set: { newVal in
                    let radius = Double(newVal)
                    viewModel.setStartFinish(at: trackManager.reference.startFinish.coordinate, radius: radius)
                }), in: 2...50)
                .frame(maxWidth: 220)
            }
        }
        .font(.footnote)
    }

    private func snapToCar() {
        viewModel.mapFollow = true
        if let coord = viewModel.telemetry?.location {
            camera = .camera(MapCamera(centerCoordinate: coord, distance: 400))
        }
    }

    private func centerOnTrack() {
        let coords = viewModel.trackReference.points.map { $0.coordinate }
        guard !coords.isEmpty else { return }
        let region = MKCoordinateRegion(track: coords)
        camera = .region(region)
    }

    private func share(url: URL) async {
        await MainActor.run {
            let av = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            if let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
               let root = scene.keyWindow?.rootViewController {
                root.present(av, animated: true)
            }
        }
    }
}

private extension MKCoordinateRegion {
    init(track coords: [CLLocationCoordinate2D]) {
        let lats = coords.map { $0.latitude }
        let lons = coords.map { $0.longitude }
        let minLat = lats.min() ?? 0
        let maxLat = lats.max() ?? 0
        let minLon = lons.min() ?? 0
        let maxLon = lons.max() ?? 0
        let span = MKCoordinateSpan(latitudeDelta: (maxLat - minLat) * 1.3, longitudeDelta: (maxLon - minLon) * 1.3)
        let center = CLLocationCoordinate2D(latitude: (minLat + maxLat) / 2, longitude: (minLon + maxLon) / 2)
        self.init(center: center, span: span)
    }
}
