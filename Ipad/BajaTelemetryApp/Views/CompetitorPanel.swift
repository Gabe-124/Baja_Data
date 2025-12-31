import SwiftUI
import UniformTypeIdentifiers

struct CompetitorPanel: View {
    @EnvironmentObject var viewModel: AppViewModel
    @State private var showingImporter = false
    @State private var manualCSV: String = "TeamA,123.45\nTeamB,130.10"

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Competitors").font(.headline)
                Spacer()
                Button("Import CSV") { showingImporter = true }
                    .buttonStyle(.bordered)
                Button("Apply Pasted") {
                    viewModel.importCompetitorsCSV(manualCSV)
                }
                .buttonStyle(.bordered)
            }
            if viewModel.competitors.isEmpty {
                Text("No competitors loaded").font(.caption).foregroundStyle(.secondary)
            } else {
                Table(viewModel.competitors) {
                    TableColumn("Team") { competitor in
                        Text(competitor.team)
                    }
                    TableColumn("Best Lap (s)") { competitor in
                        Text(String(format: "%.3f", competitor.bestLap))
                            .font(.system(.body, design: .monospaced))
                    }
                }
                .frame(minHeight: 120, maxHeight: 200)
            }
            TextEditor(text: $manualCSV)
                .font(.caption.monospaced())
                .frame(height: 80)
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.gray.opacity(0.2)))
                .padding(.top, 4)
        }
        .padding(12)
        .background(.thinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .fileImporter(isPresented: $showingImporter, allowedContentTypes: [.commaSeparatedText]) { result in
            if case let .success(url) = result, let data = try? Data(contentsOf: url), let csv = String(data: data, encoding: .utf8) {
                viewModel.importCompetitorsCSV(csv)
            }
        }
    }
}
