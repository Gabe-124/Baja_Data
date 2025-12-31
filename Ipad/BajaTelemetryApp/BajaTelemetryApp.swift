import SwiftUI

@main
struct BajaTelemetryApp: App {
    @StateObject private var viewModel = AppViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(viewModel)
                .preferredColorScheme(viewModel.preferences.prefersDarkMode ? .dark : .light)
        }
        .commands {
            CommandGroup(after: .appSettings) {
                Button("Settings") {
                    viewModel.showSettingsSheet = true
                }
                .keyboardShortcut(",", modifiers: [.command])
            }
        }
    }
}
