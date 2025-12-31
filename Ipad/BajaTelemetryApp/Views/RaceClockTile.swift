import SwiftUI

struct RaceClockTile: View {
    @EnvironmentObject var viewModel: AppViewModel
    @State private var showAdjustSheet = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Race Clock")
                    .font(.headline)
                if viewModel.raceClock.state.status == .running {
                    Text("Running").foregroundStyle(.green)
                } else if viewModel.raceClock.state.status == .complete {
                    Text("Complete").foregroundStyle(.orange)
                } else {
                    Text("Waiting").foregroundStyle(.secondary)
                }
                if viewModel.raceClock.state.offset != 0 {
                    Text("Adj").font(.caption2).padding(4).background(.yellow.opacity(0.2)).clipShape(Capsule())
                }
                Spacer()
                Button("Adj") { showAdjustSheet = true }
                    .buttonStyle(.bordered)
                Button("Start 4h Race") { viewModel.startRaceClock() }
                    .buttonStyle(.borderedProminent)
            }
            Text(remainingString)
                .font(.system(size: 36, weight: .bold, design: .monospaced))
        }
        .padding(12)
        .background(.thinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .sheet(isPresented: $showAdjustSheet) {
            adjustmentSheet
                .presentationDetents([.fraction(0.3)])
        }
    }

    private var remainingString: String {
        let remaining = viewModel.raceClock.state.remaining
        let totalMs = Int((remaining * 1000).rounded())
        let hours = totalMs / 3_600_000
        let minutes = (totalMs % 3_600_000) / 60_000
        let seconds = (totalMs % 60_000) / 1000
        let millis = totalMs % 1000
        return String(format: "%02d:%02d:%02d.%03d", hours, minutes, seconds, millis)
    }

    private var adjustmentSheet: some View {
        VStack(spacing: 12) {
            Text("Adjust Clock").font(.headline)
            HStack {
                adjustButton(label: "+1h", seconds: 3600)
                adjustButton(label: "+1m", seconds: 60)
                adjustButton(label: "+1s", seconds: 1)
                adjustButton(label: "+100ms", seconds: 0.1)
            }
            HStack {
                adjustButton(label: "-1h", seconds: -3600)
                adjustButton(label: "-1m", seconds: -60)
                adjustButton(label: "-1s", seconds: -1)
                adjustButton(label: "-100ms", seconds: -0.1)
            }
            Button("Close") { showAdjustSheet = false }
        }
        .padding()
    }

    private func adjustButton(label: String, seconds: TimeInterval) -> some View {
        Button(label) {
            viewModel.adjustRaceClock(seconds: seconds)
        }
        .buttonStyle(.bordered)
    }
}
