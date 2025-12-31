import SwiftUI

struct SourceSelector: View {
    @EnvironmentObject var viewModel: AppViewModel

    var body: some View {
        Menu {
            Picker("Source", selection: $viewModel.selectedSource) {
                ForEach(TelemetrySource.allCases) { source in
                    Text(source.label).tag(source)
                }
            }
        } label: {
            Label(viewModel.selectedSource.label, systemImage: "dot.radiowaves.left.and.right")
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Capsule().fill(Color.gray.opacity(0.15)))
        }
    }
}
