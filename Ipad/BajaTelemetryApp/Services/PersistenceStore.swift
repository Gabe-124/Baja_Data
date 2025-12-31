import Foundation

struct PersistenceStore {
    private let baseURL: URL
    private let fm = FileManager.default

    init(folderName: String = "BajaTelemetry") {
        let docs = fm.urls(for: .documentDirectory, in: .userDomainMask).first ?? URL(fileURLWithPath: NSTemporaryDirectory())
        baseURL = docs.appendingPathComponent(folderName, isDirectory: true)
        try? fm.createDirectory(at: baseURL, withIntermediateDirectories: true)
    }

    func save<T: Codable>(_ value: T, as filename: String) {
        let url = baseURL.appendingPathComponent(filename)
        do {
            let data = try JSONEncoder().encode(value)
            try data.write(to: url, options: .atomic)
        } catch {
            print("Persist error: \(error)")
        }
    }

    func load<T: Codable>(_ type: T.Type, from filename: String) -> T? {
        let url = baseURL.appendingPathComponent(filename)
        guard fm.fileExists(atPath: url.path) else { return nil }
        do {
            let data = try Data(contentsOf: url)
            return try JSONDecoder().decode(type, from: data)
        } catch {
            print("Load error: \(error)")
            return nil
        }
    }
}
