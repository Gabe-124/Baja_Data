import SwiftUI
import MapKit
import UniformTypeIdentifiers

struct MapPanel: View {
    @EnvironmentObject var viewModel: AppViewModel
    @ObservedObject var trackManager: TrackManager
    @Binding var camera: MapCameraPosition
    @State private var proxy: MapProxy? = nil
    @State private var isFollowing: Bool = true
    @State private var showingImporter = false

    var body: some View {
        VStack(spacing: 8) {
            MapReader { mapProxy in
                Map(position: $camera, interactionModes: [.all], selection: .constant(nil)) {
                    if let current = viewModel.telemetry {
                        Annotation("Car", coordinate: current.location) {
                            ZStack {
                                Circle().fill(Color.blue.opacity(0.2)).frame(width: 24, height: 24)
                                Circle().fill(Color.blue).frame(width: 12, height: 12)
                            }
                        }
                    }

                    if !trackManager.reference.points.isEmpty {
                        let coords = trackManager.reference.points.map { $0.coordinate }
                        MapPolyline(coordinates: coords)
                            .stroke(Color.orange, lineWidth: 3)
                    }

                    let sf = trackManager.reference.startFinish
                    Annotation("StartFinish", coordinate: sf.coordinate) {
                        ZStack {
                            Circle().fill(Color.green.opacity(0.15)).frame(width: 44, height: 44)
                            Circle().stroke(Color.green, lineWidth: 2).frame(width: 44, height: 44)
                            Text("S/F").font(.caption2).bold()
                        }
                    }
                    MapCircle(center: sf.coordinate, radius: sf.radiusMeters)
                        .foregroundStyle(Color.green.opacity(0.15))
                }
                .mapStyle(viewModel.mapStyle == .satellite ? .imagery : .standard)
                .gesture(SpatialTapGesture(count: 2).onEnded { value in
                    let localPoint = CGPoint(x: value.location.x, y: value.location.y)
                    if let coord = mapProxy.convert(localPoint, from: .local) {
                        viewModel.setStartFinish(at: coord, radius: viewModel.trackReference.startFinish.radiusMeters)
                    }
                })
                .onAppear { proxy = mapProxy }
                .onChange(of: viewModel.telemetry?.location) { newLocation in
                    guard let coord = newLocation else { return }
                    if viewModel.mapFollow {
                        camera = .camera(MapCamera(centerCoordinate: coord, distance: 500))
                    }
                }
                .overlay(alignment: .center) {
                    if trackManager.drawingMode {
                        Color.clear
                            .contentShape(Rectangle())
                            .gesture(DragGesture(minimumDistance: 0).onChanged { value in
                                if let coord = mapProxy.convert(value.location, from: .local) {
                                    trackManager.addDrawPoint(coord)
                                    viewModel.trackReference = trackManager.reference
                                }
                            }.onEnded { _ in
                                trackManager.finishDrawing()
                                viewModel.trackReference = trackManager.reference
                            })
                    }
                }
            }
            TrackToolsPanel(trackManager: trackManager, camera: $camera, proxy: proxy)
        }
        .onReceive(NotificationCenter.default.publisher(for: .init("OpenTrackImporter"))) { _ in
            showingImporter = true
        }
        .fileImporter(isPresented: $showingImporter, allowedContentTypes: [.json, .xml, .commaSeparatedText]) { result in
            switch result {
            case .success(let url):
                if let data = try? Data(contentsOf: url) {
                    viewModel.importTrack(from: data, type: url.pathExtension.lowercased())
                }
            case .failure(let error):
                viewModel.connectionError = error.localizedDescription
            }
        }
    }
}
