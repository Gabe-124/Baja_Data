import SwiftUI
import MapKit

struct ContentView: View {
    @EnvironmentObject var viewModel: AppViewModel
    @State private var mapCamera: MapCameraPosition = .automatic
    @State private var selectedTab: Int = 0

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                DashboardHeader(mapCamera: $mapCamera)
                if let error = viewModel.connectionError {
                    ErrorBanner(message: error)
                }
                HStack(alignment: .top, spacing: 12) {
                    MapPanel(trackManager: viewModel.trackManager, camera: $mapCamera)
                    sidePanel
                }
            }
            .padding()
            .sheet(isPresented: $viewModel.showSettingsSheet) {
                SettingsSheet()
            }
        }
    }

    private var sidePanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            RaceClockTile()
            LapTable()
            FeedStatusList()
            CompetitorPanel()
            Spacer()
        }
        .frame(minWidth: 320, maxWidth: 420)
    }
}
