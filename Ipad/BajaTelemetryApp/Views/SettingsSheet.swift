import SwiftUI
import MapKit

struct SettingsSheet: View {
    @EnvironmentObject var viewModel: AppViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var themeDark: Bool = false
    @State private var mapType: MKMapType = .standard
    @State private var gatewayHost: String = ""
    @State private var gatewayPort: String = "9000"
    @State private var telemetryURL: String = ""
    @State private var enduranceURL: String = ""
    @State private var leaderboardURL: String = ""
    @State private var penaltiesURL: String = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Appearance") {
                    Toggle("Dark Mode", isOn: $themeDark)
                    Picker("Map Type", selection: $mapType) {
                        Text("Street").tag(MKMapType.standard)
                        Text("Satellite").tag(MKMapType.satellite)
                    }
                }

                Section("Connections") {
                    TextField("Gateway Host", text: $gatewayHost)
                    TextField("Gateway Port", text: $gatewayPort).keyboardType(.numberPad)
                    TextField("Telemetry Poll URL", text: $telemetryURL)
                    TextField("Endurance URL", text: $enduranceURL)
                    TextField("Leaderboard URL", text: $leaderboardURL)
                    TextField("Penalties URL", text: $penaltiesURL)
                }

                Section("Testing") {
                    Button("Inject Mock Endurance") {
                        viewModel.injectMock(feed: .endurance, payload: "{\"status\":\"ok\"}")
                    }
                    Button("Inject Mock Leaderboard") {
                        viewModel.injectMock(feed: .leaderboard, payload: "{\"teams\":[{\"team\":1,\"lap\":3}]}")
                    }
                    Button("Inject Mock Penalties") {
                        viewModel.injectMock(feed: .penalties, payload: "{\"penalties\":[]}")
                    }
                }
            }
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                }
            }
            .onAppear { load() }
        }
    }

    private func load() {
        themeDark = viewModel.preferences.prefersDarkMode
        mapType = viewModel.preferences.mapType
        gatewayHost = viewModel.connectionSettings.gatewayHost
        gatewayPort = String(viewModel.connectionSettings.gatewayPort)
        telemetryURL = viewModel.connectionSettings.telemetryPollURL?.absoluteString ?? ""
        enduranceURL = viewModel.connectionSettings.enduranceURL?.absoluteString ?? ""
        leaderboardURL = viewModel.connectionSettings.leaderboardURL?.absoluteString ?? ""
        penaltiesURL = viewModel.connectionSettings.penaltiesURL?.absoluteString ?? ""
    }

    private func save() {
        viewModel.preferences.prefersDarkMode = themeDark
        viewModel.setMapType(mapType)
        viewModel.connectionSettings.gatewayHost = gatewayHost
        viewModel.connectionSettings.gatewayPort = Int(gatewayPort) ?? 9000
        viewModel.connectionSettings.telemetryPollURL = URL(string: telemetryURL)
        viewModel.connectionSettings.enduranceURL = URL(string: enduranceURL)
        viewModel.connectionSettings.leaderboardURL = URL(string: leaderboardURL)
        viewModel.connectionSettings.penaltiesURL = URL(string: penaltiesURL)
        viewModel.persist()
        dismiss()
    }
}
