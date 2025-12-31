import SwiftUI
import UIKit

struct LapTable: View {
    @EnvironmentObject var viewModel: AppViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Laps").font(.headline)
                Spacer()
                Button("Export JSON") {
                    if let data = viewModel.exportLapsJSON() {
                        let tmp = URL.temporaryDirectory.appendingPathComponent("laps.json")
                        try? data.write(to: tmp)
                        Task { await share(url: tmp) }
                    }
                }
                .buttonStyle(.bordered)
            }
            Table(viewModel.laps) {
                TableColumn("#") { lap in
                    Text("\(index(of: lap) + 1)")
                }.width(30)
                TableColumn("Time") { lap in
                    Text(lap.formatted)
                        .fontWeight(isBest(lap) ? .bold : .regular)
                        .foregroundStyle(isBest(lap) ? .green : .primary)
                }
                TableColumn("Δ Best") { lap in
                    if let delta = lap.deltaToBest {
                        Text(String(format: "%+.3f", delta))
                            .foregroundStyle(delta <= 0 ? .green : .red)
                    }
                }
                TableColumn("Start") { lap in
                    Text(lap.startTime, style: .time)
                }
            }
            .frame(minHeight: 120, maxHeight: 240)
        }
        .padding(12)
        .background(.thinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func index(of lap: Lap) -> Int {
        viewModel.laps.firstIndex(of: lap) ?? 0
    }

    private func isBest(_ lap: Lap) -> Bool {
        guard let best = viewModel.lapTimer.bestLap else { return false }
        return best.id == lap.id
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
