import SwiftUI

struct ErrorBanner: View {
    var message: String

    var body: some View {
        HStack {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.yellow)
            Text(message).font(.callout)
            Spacer()
        }
        .padding(10)
        .background(Color.red.opacity(0.1))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.red.opacity(0.3)))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}
