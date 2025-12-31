import SwiftUI

struct FeedStatusList: View {
    @EnvironmentObject var viewModel: AppViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Feeds").font(.headline)
            ForEach(viewModel.feedStatuses) { status in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Circle().fill(status.running ? Color.green : (status.lastError == nil ? Color.gray : Color.red)).frame(width: 10, height: 10)
                        Text(status.id.label).font(.subheadline).bold()
                        Spacer()
                        Button(status.running ? "Stop" : "Start") {
                            if status.running {
                                viewModel.stopFeed(status.id)
                            } else if let url = url(for: status.id) {
                                viewModel.startFeed(status.id)
                            }
                        }
                        .buttonStyle(.bordered)
                    }
                    if let last = status.lastPayload {
                        Text(last)
                            .font(.caption2)
                            .lineLimit(4)
                            .padding(6)
                            .background(Color.gray.opacity(0.1))
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    if let error = status.lastError {
                        Text(error).font(.caption2).foregroundStyle(.red)
                    }
                }
                .padding(10)
                .background(.thinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
    }

    private func url(for type: FeedType) -> URL? {
        switch type {
        case .endurance: return viewModel.connectionSettings.enduranceURL
        case .leaderboard: return viewModel.connectionSettings.leaderboardURL
        case .penalties: return viewModel.connectionSettings.penaltiesURL
        }
    }
}
