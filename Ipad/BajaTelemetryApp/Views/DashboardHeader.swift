import SwiftUI
import MapKit

struct DashboardHeader: View {
    @EnvironmentObject var viewModel: AppViewModel
    @Binding var mapCamera: MapCameraPosition

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Baja Telemetry iPad")
                    .font(.title2).bold()
                Text("Live telemetry, laps, feeds")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            SourceSelector()
            Button(action: viewModel.connect) {
                Label("Connect", systemImage: "bolt.fill")
            }
            .buttonStyle(.borderedProminent)

            Button(action: viewModel.reconnect) {
                Label("Reconnect", systemImage: "arrow.clockwise")
            }
            .buttonStyle(.bordered)

            Button(action: viewModel.toggleSimulation) {
                Label(viewModel.isSimulating ? "Stop Simulation" : "Start Simulation", systemImage: "sparkles")
            }
            .buttonStyle(.bordered)

            Button(action: viewModel.toggleTestTx) {
                Label(viewModel.isTestTxRunning ? "Stop Test TX" : "Start Test TX", systemImage: "antenna.radiowaves.left.and.right")
            }
            .buttonStyle(.bordered)
            .disabled(viewModel.isSimulating)

            Button(action: { viewModel.showSettingsSheet = true }) {
                Image(systemName: "gearshape.fill")
            }
            .buttonStyle(.bordered)
            .keyboardShortcut(",", modifiers: [.command])

            feedLights
        }
    }

    private var feedLights: some View {
        HStack(spacing: 8) {
            ForEach(viewModel.feedStatuses) { status in
                Circle()
                    .fill(status.running ? Color.green : (status.lastError == nil ? Color.gray : Color.red))
                    .frame(width: 12, height: 12)
                    .overlay(Text(status.id.label.prefix(1)))
            }
        }
    }
}
